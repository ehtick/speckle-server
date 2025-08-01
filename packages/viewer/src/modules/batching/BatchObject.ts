/* eslint-disable camelcase */
import { Box3, Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { NodeRenderView } from '../tree/NodeRenderView.js'
import { Geometry } from '../converter/Geometry.js'
import {
  AccelerationStructure,
  DefaultBVHOptions
} from '../objects/AccelerationStructure.js'
import { MeshBVH } from 'three-mesh-bvh'

export type VectorLike =
  | { x: number; y: number; z?: number; w?: number }
  | undefined
  | null
export type Vector3Like = VectorLike & { z: number }
export type Vector4Like = Vector3Like & { w: number }

export class BatchObject {
  protected _renderView: NodeRenderView
  protected _accelerationStructure: AccelerationStructure
  protected _batchIndex: number
  protected _localOrigin: Vector3
  public transform: Matrix4
  public transformInv: Matrix4

  public tasVertIndexStart: number
  public tasVertIndexEnd: number

  public quaternion: Quaternion = new Quaternion()
  public eulerValue: Euler = new Euler()
  public pivot_High: Vector3 = new Vector3()
  public pivot_Low: Vector3 = new Vector3()
  public translation: Vector3 = new Vector3()
  public scaleValue: Vector3 = new Vector3(1, 1, 1)
  public pivotValue: Vector3 = new Vector3()

  protected static matBuff0: Matrix4 = new Matrix4()
  protected static matBuff1: Matrix4 = new Matrix4()
  protected static matBuff2: Matrix4 = new Matrix4()
  protected static eulerBuff: Euler = new Euler()
  protected static translationBuff: Vector3 = new Vector3()
  protected static scaleBuff: Vector3 = new Vector3()
  protected static pivotBuff: Vector3 = new Vector3()

  public transformDirty = true

  public get renderView(): NodeRenderView {
    return this._renderView
  }

  public get accelerationStructure(): AccelerationStructure {
    return this._accelerationStructure
  }

  public get batchIndex(): number {
    return this._batchIndex
  }

  public get aabb(): Box3 {
    if (this.renderView.aabb) {
      const box = new Box3().copy(this.renderView.aabb)
      box.applyMatrix4(this.transform)
      return box
    }
    return new Box3()
  }

  public get localOrigin(): Vector3 {
    return this._localOrigin
  }

  public set pivot(value: Vector3 | null) {
    if (!value) {
      this.pivotValue.copy(this._localOrigin)
    } else this.pivotValue.copy(value)
    Geometry.DoubleToHighLowVector(this.pivotValue, this.pivot_Low, this.pivot_High)
  }

  public set position(value: Vector3) {
    this.transformTRS(value, this.eulerValue, this.scaleValue, this.pivotValue)
  }

  public set euler(euler: Euler) {
    this.transformTRS(this.translation, euler, this.scaleValue, this.pivotValue)
  }

  public set scale(scale: Vector3) {
    this.transformTRS(this.translation, this.eulerValue, scale, this.pivotValue)
  }

  public constructor(renderView: NodeRenderView, batchIndex: number) {
    this._renderView = renderView
    this._batchIndex = batchIndex
    this.transform = new Matrix4().identity()
    this.transformInv = new Matrix4().identity()

    this._localOrigin = this._renderView.aabb.getCenter(new Vector3())
    this.pivotValue.copy(this._localOrigin)
    Geometry.DoubleToHighLowVector(
      new Vector3(this._localOrigin.x, this._localOrigin.y, this._localOrigin.z),
      this.pivot_Low,
      this.pivot_High
    )
  }
  public buildAccelerationStructure(
    position: Float32Array | Float64Array,
    indices: Uint16Array | Uint32Array
  ): void
  public buildAccelerationStructure(bvh: MeshBVH): void

  public buildAccelerationStructure(
    positionOrBvh: Float32Array | Float64Array | MeshBVH,
    indices?: Uint16Array | Uint32Array
  ): void {
    const transform = new Matrix4().makeTranslation(
      this._localOrigin.x,
      this._localOrigin.y,
      this._localOrigin.z
    )
    transform.invert()

    let bvh = positionOrBvh

    if (!(bvh instanceof MeshBVH)) {
      if (!indices) {
        throw new Error(`Cannot build a BVH with only positions. Need indices too`)
      }
      bvh = AccelerationStructure.buildBVH(
        indices,
        positionOrBvh as Float32Array | Float64Array,
        DefaultBVHOptions,
        transform
      )
    }

    this._accelerationStructure = new AccelerationStructure(bvh)
    this._accelerationStructure.inputTransform = this.transformInv
    this._accelerationStructure.outputTransform = this.transform
    this._accelerationStructure.inputOriginTransform = new Matrix4().copy(transform)
    this._accelerationStructure.outputOriginTransfom = new Matrix4()
      .copy(transform)
      .invert()
  }

  public transformTRS(
    translation: Vector3Like,
    euler?: Vector3Like,
    scale?: Vector3Like,
    pivot?: Vector3Like
  ) {
    let T: Matrix4 = BatchObject.matBuff0.identity()
    let R: Matrix4 = BatchObject.matBuff1.identity()
    let S: Matrix4 = BatchObject.matBuff2.identity()
    BatchObject.eulerBuff.set(0, 0, 0, 'XYZ')
    BatchObject.translationBuff.set(0, 0, 0)
    BatchObject.scaleBuff.set(1, 1, 1)
    BatchObject.pivotBuff.copy(this._localOrigin)

    if (translation) {
      T = BatchObject.matBuff0.makeTranslation(
        translation.x,
        translation.y,
        translation.z
      )
      BatchObject.translationBuff.set(translation.x, translation.y, translation.z)
    }

    if (euler) {
      BatchObject.eulerBuff.set(euler.x, euler.y, euler.z, 'XYZ')
      R = BatchObject.matBuff1.makeRotationFromEuler(BatchObject.eulerBuff)
      this.quaternion.setFromEuler(BatchObject.eulerBuff)
      this.eulerValue.copy(BatchObject.eulerBuff)
    }

    if (scale) {
      S = BatchObject.matBuff2.makeScale(scale.x, scale.y, scale.z)
      BatchObject.scaleBuff.set(scale.x, scale.y, scale.z)
    }

    if (pivot) {
      BatchObject.pivotBuff.set(pivot.x, pivot.y, pivot.z)
    }

    this.transform.identity()
    this.transform.multiply(T)
    this.transform.multiply(R)
    this.transform.multiply(S)

    const mat = new Matrix4().multiplyMatrices(
      new Matrix4().makeTranslation(
        BatchObject.pivotBuff.x,
        BatchObject.pivotBuff.y,
        BatchObject.pivotBuff.z
      ),
      this.transform
    )

    mat.multiply(
      new Matrix4().makeTranslation(
        -BatchObject.pivotBuff.x,
        -BatchObject.pivotBuff.y,
        -BatchObject.pivotBuff.z
      )
    )
    this.transform.copy(mat)

    this.transformInv.copy(this.transform)
    this.transformInv.invert()

    this.translation.copy(BatchObject.translationBuff)
    this.quaternion.setFromEuler(BatchObject.eulerBuff)
    this.scaleValue.copy(BatchObject.scaleBuff)
    this.pivotValue.copy(BatchObject.pivotBuff)

    Geometry.DoubleToHighLowVector(
      BatchObject.pivotBuff,
      this.pivot_Low,
      this.pivot_High
    )
    this.transformDirty = true
  }
}
