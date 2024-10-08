import {
  AddEquation,
  CustomBlending,
  DstAlphaFactor,
  DstColorFactor,
  NoBlending,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Texture,
  WebGLRenderer,
  ZeroFactor
} from 'three'
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js'
import { speckleApplyAoFrag } from '../materials/shaders/speckle-apply-ao-frag.js'
import { speckleApplyAoVert } from '../materials/shaders/speckle-apply-ao-vert.js'
import {
  type InputColorTextureUniform,
  type InputColorInterpolateTextureUniform,
  type SpeckleProgressivePass,
  RenderType
} from './SpecklePass.js'

export class ApplySAOPass extends Pass implements SpeckleProgressivePass {
  private fsQuad: FullScreenQuad
  public materialCopy: ShaderMaterial
  private frameIndex = 0
  private accumulatioFrames = 0

  constructor() {
    super()
    this.materialCopy = new ShaderMaterial({
      defines: {
        ACCUMULATE: 0,
        PASSTHROUGH: 0
      },
      uniforms: {
        tDiffuse: { value: null },
        tDiffuseInterp: { value: null },
        frameIndex: { value: 0 }
      },
      vertexShader: speckleApplyAoVert,
      fragmentShader: speckleApplyAoFrag,
      blending: NoBlending
    })
    this.materialCopy.transparent = true
    this.materialCopy.depthTest = false
    this.materialCopy.depthWrite = false
    this.materialCopy.blending = CustomBlending
    this.materialCopy.blendSrc = DstColorFactor
    this.materialCopy.blendDst = ZeroFactor
    this.materialCopy.blendEquation = AddEquation
    this.materialCopy.blendSrcAlpha = DstAlphaFactor
    this.materialCopy.blendDstAlpha = ZeroFactor
    this.materialCopy.blendEquationAlpha = AddEquation

    this.materialCopy.needsUpdate = true
    this.fsQuad = new FullScreenQuad(this.materialCopy)
  }

  public setTexture(
    uName: InputColorTextureUniform | InputColorInterpolateTextureUniform,
    texture: Texture
  ) {
    this.materialCopy.uniforms[uName].value = texture
    this.materialCopy.needsUpdate = true
  }

  get displayName(): string {
    return 'APPLYSAO'
  }

  get outputTexture(): Texture | null {
    return null
  }

  setParams(params: boolean | undefined) {
    if (params !== undefined) {
      this.materialCopy.defines['USE_DYNAMIC_AO'] = +params
    }
  }

  setFrameIndex(index: number) {
    this.frameIndex = index
  }

  setAccumulationFrames(frames: number) {
    this.accumulatioFrames = frames
  }

  setRenderType(type: RenderType) {
    this.materialCopy.defines['PASSTHROUGH'] = 0

    if (type === RenderType.NORMAL) {
      this.materialCopy.defines['ACCUMULATE'] = 0
      if (this.accumulatioFrames === this.frameIndex + 1)
        this.materialCopy.defines['PASSTHROUGH'] = 1
    } else {
      this.materialCopy.defines['ACCUMULATE'] = 1
      this.frameIndex = 0
    }
    this.materialCopy.needsUpdate = true
  }

  public update(scene: Scene, camera: PerspectiveCamera | OrthographicCamera) {
    scene
    camera
    this.materialCopy.defines['NUM_FRAMES'] = this.accumulatioFrames
    this.materialCopy.uniforms['frameIndex'].value = this.frameIndex
    this.materialCopy.needsUpdate = true
  }

  render(renderer: WebGLRenderer) {
    renderer.setRenderTarget(null)
    const rendereAutoClear = renderer.autoClear
    renderer.autoClear = false
    this.fsQuad.render(renderer)
    renderer.autoClear = rendereAutoClear
  }
}
