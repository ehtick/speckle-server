/* istanbul ignore file */
import passport from 'passport'
import type { IProfile, VerifyCallback } from 'passport-azure-ad'
import { OIDCStrategy } from 'passport-azure-ad'

import {
  UserInputError,
  UnverifiedEmailSSOLoginError
} from '@/modules/core/errors/userinput'

import { ServerInviteResourceType } from '@/modules/serverinvites/domain/constants'
import { getResourceTypeRole } from '@/modules/serverinvites/helpers/core'
import type { AuthStrategyBuilder } from '@/modules/auth/helpers/types'
import {
  getAzureAdClientId,
  getAzureAdClientSecret,
  getAzureAdIdentityMetadata,
  getAzureAdIssuer,
  getServerOrigin
} from '@/modules/shared/helpers/envHelper'
import type { Request } from 'express'
import type { Optional } from '@speckle/shared'
import { ensureError } from '@speckle/shared'
import type { ServerInviteRecord } from '@/modules/serverinvites/domain/types'
import type {
  FinalizeInvitedServerRegistration,
  ResolveAuthRedirectPath,
  ValidateServerInvite
} from '@/modules/serverinvites/services/operations'
import type { PassportAuthenticateHandlerBuilder } from '@/modules/auth/domain/operations'
import type {
  FindOrCreateValidatedUser,
  LegacyGetUserByEmail
} from '@/modules/core/domain/users/operations'
import type { GetServerInfo } from '@/modules/core/domain/server/operations'
import { EnvironmentResourceError } from '@/modules/shared/errors'
import { InviteNotFoundError } from '@/modules/serverinvites/errors'

const azureAdStrategyBuilderFactory =
  (deps: {
    getServerInfo: GetServerInfo
    getUserByEmail: LegacyGetUserByEmail
    findOrCreateUser: FindOrCreateValidatedUser
    validateServerInvite: ValidateServerInvite
    finalizeInvitedServerRegistration: FinalizeInvitedServerRegistration
    resolveAuthRedirectPath: ResolveAuthRedirectPath
    passportAuthenticateHandlerBuilder: PassportAuthenticateHandlerBuilder
  }): AuthStrategyBuilder =>
  async (
    app,
    sessionMiddleware,
    moveAuthParamsToSessionMiddleware,
    finalizeAuthMiddleware
  ) => {
    const strategy = new OIDCStrategy(
      {
        identityMetadata: getAzureAdIdentityMetadata(),
        clientID: getAzureAdClientId(),
        responseType: 'code id_token',
        responseMode: 'form_post',
        issuer: getAzureAdIssuer(),
        redirectUrl: new URL('/auth/azure/callback', getServerOrigin()).toString(),
        allowHttpForRedirectUrl: true,
        clientSecret: getAzureAdClientSecret(),
        scope: ['profile', 'email', 'openid'],
        loggingLevel: process.env.NODE_ENV === 'development' ? 'info' : 'error',
        passReqToCallback: true
      },
      // Dunno why TS isn't picking up on the types automatically
      async (
        _req: Request,
        _iss: string,
        _sub: string,
        profile: IProfile,
        _accessToken: string,
        _refreshToken: string,
        done: VerifyCallback
      ) => {
        done(null, profile)
      }
    )

    passport.use(strategy)

    // 1. Auth init
    app.get(
      '/auth/azure',
      sessionMiddleware,
      moveAuthParamsToSessionMiddleware,
      deps.passportAuthenticateHandlerBuilder('azuread-openidconnect')
    )

    // 2. Auth finish callback
    app.post(
      '/auth/azure/callback',
      sessionMiddleware,
      deps.passportAuthenticateHandlerBuilder('azuread-openidconnect'),
      async (req, _res, next) => {
        const serverInfo = await deps.getServerInfo()
        let logger = req.log.child({
          authStrategy: 'entraId',
          serverVersion: serverInfo.version
        })

        try {
          // This is the only strategy that does its own type for req.user - easier to force type cast for now
          // than to refactor everything
          const profile = req.user as Optional<IProfile>
          if (!profile) {
            throw new EnvironmentResourceError('No profile provided by Entra ID')
          }

          logger = logger.child({ profileId: profile.oid })

          const user = {
            email: profile._json.email,
            name: profile._json.name || profile.displayName
          }

          const existingUser = await deps.getUserByEmail({ email: user.email })

          if (existingUser && !existingUser.verified) {
            throw new UnverifiedEmailSSOLoginError(undefined, {
              info: {
                email: user.email
              }
            })
          }

          // if there is an existing user, go ahead and log them in (regardless of
          // whether the server is invite only or not).
          if (existingUser) {
            const myUser = await deps.findOrCreateUser({
              user
            })
            // ID is used later for verifying access token
            req.user = {
              ...profile,
              id: myUser.id,
              email: myUser.email
            }
            return next()
          }

          // if the server is invite only and we have no invite id, throw.
          if (serverInfo.inviteOnly && !req.session.token) {
            throw new UserInputError(
              'This server is invite only. Please authenticate yourself through a valid invite link.'
            )
          }

          // 2. if you have an invite it must be valid, both for invite only and public servers
          let invite: Optional<ServerInviteRecord> = undefined
          if (req.session.token) {
            invite = await deps.validateServerInvite(user.email, req.session.token)
          }

          // create the user
          const myUser = await deps.findOrCreateUser({
            user: {
              ...user,
              role: invite
                ? getResourceTypeRole(invite.resource, ServerInviteResourceType)
                : undefined,
              verified: !!invite,
              signUpContext: {
                req,
                isInvite: !!invite,
                newsletterConsent: !!req.session.newsletterConsent
              }
            }
          })

          // ID is used later for verifying access token
          req.user = {
            ...profile,
            id: myUser.id,
            email: myUser.email,
            isNewUser: myUser.isNewUser,
            isInvite: !!invite
          }

          req.log = req.log.child({ userId: myUser.id })

          // use the invite
          await deps.finalizeInvitedServerRegistration(user.email, myUser.id)

          // Resolve redirect path
          req.authRedirectPath = deps.resolveAuthRedirectPath(invite)

          // return to the auth flow
          return next()
        } catch (err) {
          const e = ensureError(
            err,
            'Unexpected issue occured while authenticating with Entra ID'
          )

          switch (e.constructor) {
            case UserInputError:
            case UnverifiedEmailSSOLoginError:
            case InviteNotFoundError:
              logger.info(
                { err: e },
                'User input error during Entra ID authentication callback.'
              )
              break
            default:
              logger.error(e, 'Error during Entra ID authentication callback.')
          }
          //skip remaining route handlers and go to error handler
          return next(e)
        }
      },
      finalizeAuthMiddleware
    )

    return {
      id: 'azuread',
      name: process.env.AZURE_AD_ORG_NAME || 'Microsoft',
      icon: 'mdi-microsoft',
      color: 'blue darken-3',
      url: '/auth/azure',
      callbackUrl: new URL('/auth/azure/callback', getServerOrigin()).toString()
    }
  }

export default azureAdStrategyBuilderFactory
