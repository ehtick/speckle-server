<template>
  <div class="relative z-10 flex flex-col !mt-0">
    <!-- Left Arrow Button -->
    <div
      class="absolute left-[-2px] top-[-2px] z-20 pr-8 bg-gradient-to-r from-foundation-page to-transparent"
    >
      <button
        v-if="showLeftArrow"
        class="bg-foundation p-1 rounded-full border border-outline-4 shadow"
        @click="scrollLeft"
      >
        <ArrowLongLeftIcon class="h-4 w-4" />
      </button>
    </div>
    <div class="absolute left-0 z-10 w-full h-[1px] mt-px bg-outline-3 top-7"></div>
    <div
      ref="scrollContainer"
      class="relative overflow-x-auto hide-scrollbar w-full"
      @scroll="handleScroll"
    >
      <div
        :style="borderStyle"
        class="h-[2px] absolute bottom-0 z-20 transition-[left,width] duration-300"
        :class="isInitialSetup ? 'bg-transparent' : 'bg-primary'"
      ></div>

      <div ref="buttonContainer" class="flex w-full space-x-4">
        <button
          v-for="item in items"
          :key="item.id"
          :data-tab-id="item.id"
          :class="[
            buttonClass(item),
            { '!border-primary': isActiveItem(item) && isInitialSetup }
          ]"
          class="tab-button"
          :disabled="item.disabled"
          @click="setActiveItem(item)"
        >
          <div class="flex space-x-2 items-center">
            <component
              :is="item.icon"
              v-if="item.icon"
              class="shrink-0 h-4 w-4 stroke-[2px]"
            />

            <div class="min-w-6">
              <span
                v-if="item.disabled && item.disabledMessage"
                v-tippy="item.disabledMessage"
              >
                {{ item.title }}
              </span>
              <span v-else>{{ item.title }}</span>
            </div>
            <div
              v-if="item.count"
              class="rounded-full px-2 text-body-3xs transition-all min-w-6"
              :class="
                activeItem?.id === item.id
                  ? 'text-primary bg-info-lighter dark:text-foreground'
                  : 'text-foreground-2 bg-highlight-3'
              "
            >
              <span>{{ item.count }}</span>
            </div>
            <CommonBadge v-if="item.tag">
              {{ item.tag }}
            </CommonBadge>
          </div>
        </button>
      </div>
    </div>

    <!-- Right Arrow Button -->
    <div
      class="absolute right-[-2px] top-[-2px] z-20 pl-8 bg-gradient-to-l from-foundation-page to-transparent"
    >
      <button
        v-if="showRightArrow"
        class="bg-foundation p-1 rounded-full border border-outline-3 shadow"
        @click="scrollRight"
      >
        <ArrowLongRightIcon class="h-4 w-4" />
      </button>
    </div>
    <div class="pt-4">
      <slot :active-item="activeItem" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch, onBeforeUnmount } from 'vue'
import type { CSSProperties } from 'vue'
import type { LayoutPageTabItem } from '~~/src/helpers/layout/components'
import { isClient } from '@vueuse/core'
import { ArrowLongRightIcon, ArrowLongLeftIcon } from '@heroicons/vue/24/outline'
import type { Nullable } from '@speckle/shared'
import { throttle } from '#lodash'
import { useResizeObserver } from '@vueuse/core'
import CommonBadge from '~~/src/components/common/Badge.vue'

const props = defineProps<{
  items: LayoutPageTabItem[]
}>()

const activeItem = defineModel<LayoutPageTabItem>('activeItem', { required: true })

const buttonContainer = ref(null as Nullable<HTMLDivElement>)
const scrollContainer = ref<HTMLElement | null>(null)
const showLeftArrow = ref(false)
const showRightArrow = ref(false)
const isInitialSetup = ref(true)

const underlineLeft = ref('0px')
const underlineWidth = ref('0px')

const buttonClass = computed(() => {
  return (item: LayoutPageTabItem) => {
    const isActive = activeItem.value?.id === item.id
    const baseClasses = [
      'relative',
      'z-10',
      'flex',
      'items-center',
      'disabled:opacity-60 disabled:hover:border-transparent disabled:cursor-not-allowed disabled:hover:bg-transparent',
      'text-body-xs',
      'hover:sm:border-outline-2',
      'pb-2',
      'border-b-[2px]',
      'border-transparent',
      'max-w-max',
      'last:mr-6',
      'whitespace-nowrap'
    ]

    if (isActive) baseClasses.push('text-primary', 'hover:text-primary')
    else baseClasses.push('text-foreground')

    return baseClasses
  }
})

const activeItemRef = computed(() => {
  const id = activeItem.value?.id
  if (!id) return null

  const parent = buttonContainer.value
  if (!parent) return null

  const btns = [...parent.getElementsByClassName('tab-button')] as HTMLElement[]
  return btns.find((b) => b.dataset['tabId'] === id) || null
})

const borderStyle = computed<CSSProperties>(() => ({
  left: underlineLeft.value,
  width: underlineWidth.value
}))

const updateUnderline = () => {
  const el = activeItemRef.value
  if (!el) return

  underlineLeft.value = `${el.offsetLeft}px`
  underlineWidth.value = `${el.clientWidth}px`
}

const setActiveItem = (item: LayoutPageTabItem) => {
  activeItem.value = item
  isInitialSetup.value = false
}

const isActiveItem = (item: LayoutPageTabItem) => {
  return activeItem.value?.id === item.id
}

const checkArrowsVisibility = () => {
  const container = scrollContainer.value
  if (!container) return

  const scrollWidth = container.scrollWidth
  const clientWidth = container.clientWidth
  const scrollLeft = container.scrollLeft
  const buffer = 1

  showLeftArrow.value = scrollLeft > buffer
  showRightArrow.value = scrollLeft < scrollWidth - clientWidth - buffer
}

const scrollLeft = () => {
  scrollContainer.value?.scrollBy({ left: -100, behavior: 'smooth' }) // Adjust the scroll amount as needed
  checkArrowsVisibility()
}

const scrollRight = () => {
  scrollContainer.value?.scrollBy({ left: 100, behavior: 'smooth' }) // Adjust the scroll amount as needed
  checkArrowsVisibility()
}

const handleScroll = throttle(() => {
  checkArrowsVisibility()
}, 250)

const ensureActiveItemVisible = () => {
  const activeButton = activeItemRef.value
  if (activeButton && scrollContainer.value) {
    activeButton.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center'
    })
  }
}

onMounted(() => {
  if (isClient) {
    if (props.items.length && !activeItem.value) {
      setActiveItem(props.items[0])
    }
    checkArrowsVisibility()
    ensureActiveItemVisible()
  }
})

watch(
  () => [props.items, activeItem.value] as const,
  ([newItems]) => {
    if (Array.isArray(newItems) && newItems.length && !activeItem.value) {
      setActiveItem(newItems[0])
    }
    checkArrowsVisibility()
  }
)

const { stop: stopResizeObserver } = useResizeObserver(activeItemRef, () =>
  updateUnderline()
)

onBeforeUnmount(() => {
  handleScroll.cancel()
  stopResizeObserver()
})
</script>
<style>
/* Hide scrollbar for Chrome, Safari and Opera */
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

/* Hide scrollbar for IE, Edge and Firefox */
.hide-scrollbar {
  -ms-overflow-style: none; /* IE and Edge */
  scrollbar-width: none; /* Firefox */
}
</style>
