<template>
  <div
    class="relative flex space-x-2 mb-2 last:mb-0"
    :class="description && inlineDescription ? 'items-start' : 'items-center'"
  >
    <div class="flex items-center" :class="size === 'sm' ? 'h-4' : 'h-6'">
      <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -->
      <input
        :id="finalId"
        :checked="coreChecked"
        :aria-describedby="descriptionId"
        :name="name"
        :disabled="disabled"
        :value="radioValue"
        type="radio"
        class="h-4 w-4 rounded-full text-primary focus:ring-primary bg-foundation disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-2"
        :class="computedClasses"
        v-bind="$attrs"
        @change="onChange"
      />
    </div>
    <div
      :class="[
        inlineDescription ? 'flex space-x-2 items-center' : '',
        size === 'sm' ? 'text-body-2xs' : 'text-body-xs'
      ]"
    >
      <label
        :for="finalId"
        class="text-foreground flex space-x-2 items-center cursor-pointer"
        :class="{ 'sr-only': hideLabel, '!cursor-not-allowed opacity-70': disabled }"
      >
        <div v-if="icon">
          <component
            :is="icon"
            :class="[
              size === 'sm' ? 'h-6 sm:h-8 w-6 sm:w-8' : 'h-8 w-8 sm:h-10 sm:w-10'
            ]"
          />
        </div>
        <div class="flex flex-col">
          <span :class="labelClasses ? labelClasses : ''">{{ title }}</span>
          <p
            v-if="descriptionText && !inlineDescription"
            :id="descriptionId"
            :class="descriptionClasses"
          >
            {{ descriptionText }}
          </p>
        </div>
        <span v-if="showRequired" class="text-danger ml-1">*</span>
      </label>
      <p
        v-if="descriptionText && inlineDescription"
        :id="descriptionId"
        :class="descriptionClasses"
      >
        {{ descriptionText }}
      </p>
    </div>
  </div>
</template>
<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { useField } from 'vee-validate'
import type { RuleExpression } from 'vee-validate'
import { computed, onMounted, ref } from 'vue'
import type { PropType, ConcreteComponent } from 'vue'
import type { Optional } from '@speckle/shared'
import { nanoid } from 'nanoid'

/**
 * Troubleshooting:
 * - If clicking on the radio doesn't do anything, check if any of its ancestor elements
 * have a @click.prevent on them anywhere.
 * - If you're not using the radio in a group, it's suggested that you set :value="true",
 * so that a v-model attached to the radio will be either 'true' or 'undefined' depending on the
 * checked state
 */

type ValueType = Optional<string | true> | string[]
type Size = 'sm' | 'base'

defineOptions({
  inheritAttrs: false
})

const props = defineProps({
  /**
   * Input name/id. In a radio group, all radios must have the same name and different values.
   */
  name: {
    type: String,
    required: true
  },
  /**
   * Whether the input is disabled
   */
  disabled: {
    type: Boolean,
    default: false
  },
  /**
   * Set label text
   */
  label: {
    type: String as PropType<Optional<string>>,
    default: undefined
  },
  /**
   * Set label text classes
   */
  labelClasses: {
    type: String as PropType<Optional<string>>,
    default: undefined
  },
  /**
   * Help text
   */
  description: {
    type: String as PropType<Optional<string>>,
    default: undefined
  },
  /**
   * Whether to inline the help description
   */
  inlineDescription: {
    type: Boolean,
    default: false
  },
  /**
   * Optional Icon
   */
  icon: {
    type: Object as PropType<ConcreteComponent>,
    default: undefined
  },
  /**
   * vee-validate validation rules
   */
  rules: {
    type: [String, Object, Function, Array] as PropType<RuleExpression<ValueType>>,
    default: undefined
  },
  /**
   * vee-validate validation() on component mount
   */
  validateOnMount: {
    type: Boolean,
    default: false
  },
  /**
   * Whether to show the red "required" asterisk
   */
  showRequired: {
    type: Boolean,
    default: false
  },
  /**
   * Radio group's value
   */
  modelValue: {
    type: [String, Boolean] as PropType<ValueType | false>,
    default: undefined
  },
  /**
   * Radio's own value. If it is checked, modelValue will include this value (amongst any other checked values from the same group).
   * If not set will default to 'name' value.
   */
  value: {
    type: [String, Boolean] as PropType<Optional<string | true>>,
    default: true
  },
  /**
   * HTML ID to use, must be globally unique. If not specified, a random ID will be generated. One is necessary to properly associate the label and radio.
   */
  id: {
    type: String as PropType<Optional<string>>,
    default: undefined
  },
  hideLabel: {
    type: Boolean,
    default: false
  },
  size: {
    type: String as PropType<Optional<Size>>,
    default: 'base'
  }
})

const generateRandomId = (prefix: string) => `${prefix}-${nanoid()}`

defineEmits<{
  (e: 'update:modelValue', val: ValueType): void
}>()

const radioValue = computed(() => props.value || props.name)

const {
  checked: coreChecked,
  errorMessage,
  handleChange,
  value: coreValue
} = useField<ValueType>(props.name, props.rules, {
  validateOnMount: props.validateOnMount,
  type: 'radio',
  checkedValue: radioValue,
  initialValue: props.modelValue || undefined
})

const title = computed(() => props.label || props.name)

const computedClasses = computed((): string => {
  return errorMessage.value ? 'border-danger-lighter' : 'border-foreground-4 '
})

const descriptionText = computed(() => props.description || errorMessage.value)
const descriptionId = computed(() => `${props.name}-description`)
const descriptionClasses = computed((): string => {
  const classParts: string[] = ['text-body-3xs']

  if (errorMessage.value) {
    classParts.push('text-danger')
  } else {
    classParts.push('text-foreground-2')
  }

  return classParts.join(' ')
})

const implicitId = ref<Optional<string>>(generateRandomId('radio'))
const finalId = computed(() => props.id || implicitId.value)

const onChange = (e: unknown) => {
  if (props.disabled) return
  handleChange(e)
}

/**
 * Bugfix for strange issue where radio appears checked even tho it shouldnt be.
 * It's not clear why this happens, but for some reason coreValue.value shows that the radio
 * is checked, even tho props.modelValue is undefined.
 */
onMounted(() => {
  const newModelValue = props.modelValue
  const newCoreValue = coreValue.value

  const shouldBeChecked = Array.isArray(newModelValue)
    ? newModelValue.includes(props.value as any)
    : newModelValue === props.value

  const isCoreChecked = Array.isArray(newCoreValue)
    ? newCoreValue.includes(props.value as any)
    : newCoreValue === props.value

  if (shouldBeChecked !== isCoreChecked) {
    handleChange(newModelValue)
  }
})
</script>
