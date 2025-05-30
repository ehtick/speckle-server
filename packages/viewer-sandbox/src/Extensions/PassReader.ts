import type { GPass, SpeckleRenderer } from '@speckle/viewer'
import { Extension } from '@speckle/viewer'
import type { WebGLRenderTarget } from 'three'
import { Vector3, Vector4 } from 'three'

export class PassReader extends Extension {
  private outputBuffer: Uint8ClampedArray = new Uint8ClampedArray()
  private renderTarget: WebGLRenderTarget | null = null
  private needsRead: boolean = false
  private readbackExecutor:
    | ((arg: [Uint8ClampedArray, number, number]) => void)
    | null = null

  public async read(pass: string): Promise<[Uint8ClampedArray, number, number]>
  public async read(pass: GPass | GPass[]): Promise<[Uint8ClampedArray, number, number]>

  public async read(
    pass: string | GPass | GPass[]
  ): Promise<[Uint8ClampedArray, number, number]> {
    return new Promise<[Uint8ClampedArray, number, number]>((resolve, reject) => {
      const renderer: SpeckleRenderer = this.viewer.getRenderer()
      let passes: GPass[]
      if (typeof pass === 'string') passes = renderer.pipeline.getPass(pass)
      else if (Array.isArray(pass)) passes = pass
      else passes = [pass]

      if (!passes || !passes.length) {
        reject(`Could not read from pass`)
        return
      }
      const validPass = passes.find((pass: GPass) => this.hasFramebuffer(pass))

      if (!validPass) {
        reject(`Requested pass does not have a valid framebuffer`)
        return
      }

      this.renderTarget = validPass.outputTarget

      if (!this.renderTarget) {
        reject('Requested Pass does not have a render target assigned')
        return
      }

      const bufferSize =
        Math.floor(this.renderTarget.width) * Math.floor(this.renderTarget.height) * 4
      if (this.outputBuffer.length !== bufferSize)
        this.outputBuffer = new Uint8ClampedArray(bufferSize)
      this.needsRead = true
      this.readbackExecutor = resolve
    })
  }

  protected hasFramebuffer(pass: GPass) {
    const renderer = this.viewer.getRenderer().renderer
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return renderer.properties.get(pass.outputTarget).__webglFramebuffer !== undefined
  }

  public onRender(): void {
    if (!this.needsRead || !this.renderTarget) return

    const renderer = this.viewer.getRenderer().renderer
    renderer.readRenderTargetPixels(
      this.renderTarget,
      0,
      0,
      this.renderTarget.width,
      this.renderTarget.height,
      this.outputBuffer
    )

    if (this.readbackExecutor)
      this.readbackExecutor([
        this.outputBuffer,
        this.renderTarget.width,
        this.renderTarget.height
      ])
    this.needsRead = false
  }

  public static decodeDepth(buffer: Uint8ClampedArray): Uint8ClampedArray {
    const UnpackDownscale = 255 / 256
    const PackFactors = new Vector3(256 * 256 * 256, 256 * 256, 256)
    const UnpackFactors = new Vector4(
      UnpackDownscale / PackFactors.x,
      UnpackDownscale / PackFactors.y,
      UnpackDownscale / PackFactors.z,
      1
    )

    const v4 = new Vector4()
    for (let k = 0; k < buffer.length; k += 4) {
      v4.set(
        buffer[k] / 255,
        buffer[k + 1] / 255,
        buffer[k + 2] / 255,
        buffer[k + 3] / 255
      )
      const res = v4.dot(UnpackFactors)
      buffer[k] = res * 255
      buffer[k + 1] = res * 255
      buffer[k + 2] = res * 255
      buffer[k + 3] = 255
    }

    return buffer
  }

  public static toBase64(
    buffer: Uint8ClampedArray,
    width: number,
    height: number
  ): string {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    canvas.width = width
    canvas.height = height

    // create imageData object
    const idata = ctx.createImageData(width, height)

    // set our buffer as source
    idata.data.set(buffer)

    // update canvas with new data
    ctx.putImageData(idata, 0, 0)
    ctx.save()
    /** Flipping the image by drawing it on itself
     */
    ctx.globalCompositeOperation = 'copy'
    ctx.scale(1, -1)
    ctx.drawImage(canvas, 0, 0, width, -height)
    ctx.restore()

    return canvas.toDataURL()
  }
}
