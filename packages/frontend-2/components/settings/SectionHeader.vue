<template>
  <div class="flex flex-col">
    <div
      class="flex flex-col md:flex-row gap-3 md:gap-0 justify-between"
      :class="{ 'md:items-center': subheading }"
    >
      <h2 v-if="subheading" class="text-heading-lg">{{ title }}</h2>
      <h1 v-else class="text-heading-xl">
        {{ title }}
      </h1>
      <div v-if="buttons.length > 0" class="flex flex-wrap gap-2">
        <FormButton
          v-for="(button, index) in buttons"
          :key="index"
          v-bind="button.props"
          class="shrink-0 whitespace-nowrap"
          @click="($event) => button.onClick?.($event)"
        >
          {{ button.label }}
        </FormButton>
      </div>
    </div>
    <p
      v-if="text"
      class="text-body-sm text-foreground-2 pt-2"
      :class="{ 'pt-6': subheading }"
    >
      {{ text }}
    </p>
    <hr v-if="!subheading && !hideDivider" class="my-6 border-outline-2" />
    <slot />
  </div>
</template>

<script lang="ts" setup>
import type { LayoutHeaderButton } from '@speckle/ui-components'

withDefaults(
  defineProps<{
    title: string
    text?: string
    buttons?: LayoutHeaderButton[]
    subheading?: boolean
    hideDivider?: boolean
  }>(),
  {
    buttons: () => []
  }
)
</script>
