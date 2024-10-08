import { AuthContext } from '@/modules/shared/authz'
import { base64Decode, base64Encode } from '@/modules/shared/helpers/cryptoHelper'
import DataLoader from 'dataloader'
import dayjs, { Dayjs } from 'dayjs'

/**
 * Encode cursor to turn it into an opaque & obfuscated value
 */
export function encodeCursor(value: string): string {
  return base64Encode(value)
}

/**
 * Decode obfuscated cursor value
 */
export function decodeCursor(value: string): string {
  return base64Decode(value)
}

export function decodeIsoDateCursor(value: string): string | null {
  const decoded = decodeCursor(value)
  if (!decoded) return null

  const date = dayjs(decoded)
  if (!date.isValid()) return null

  return date.toISOString()
}

export function encodeIsoDateCursor(date: Date | Dayjs): string {
  const str = date.toISOString()
  return encodeCursor(str)
}

export type RequestDataLoadersBuilder<
  T extends {
    [group: string]: {
      [loader: string]: unknown
    }
  }
> = (params: {
  ctx: AuthContext
  createLoader: <K, V, C = K>(
    batchLoadFn: DataLoader.BatchLoadFn<K, V>,
    options?: DataLoader.Options<K, V, C>
  ) => DataLoader<K, V, C>
}) => T

export type RequestDataLoaders<
  T extends {
    [group: string]: {
      [loader: string]: unknown
    }
  }
> = ReturnType<RequestDataLoadersBuilder<T>>

export const defineRequestDataloaders = <
  T extends {
    [group: string]: {
      [loader: string]: unknown
    }
  }
>(
  builder: RequestDataLoadersBuilder<T>
): RequestDataLoadersBuilder<T> => {
  return builder
}
