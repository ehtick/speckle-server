<template>
  <HeadlessMenu v-slot="{ open: isMenuOpen }" as="div" class="relative inline-block">
    <div>
      <MenuButton :id="menuId" ref="menuButton" class="hidden" @click.stop.prevent />
      <!-- conditional pointer-events-none is necessary to avoid double events when clicking on the button when the menu is already open -->
      <div ref="menuButtonWrapper" :class="isMenuOpen ? 'pointer-events-none' : ''">
        <slot :toggle="toggle" :open="processOpen(isMenuOpen)" />
      </div>
    </div>
    <Teleport to="body" :disabled="!mountMenuOnBody">
      <MenuItems
        v-if="isMenuOpen"
        ref="menuItems"
        :class="menuItemsClasses"
        :style="menuItemsStyles"
      >
        <div v-for="(group, i) in items" :key="i" class="p-1">
          <MenuItem
            v-for="item in group"
            v-slot="{ active, disabled }"
            :key="item.id"
            :disabled="item.disabled"
            :color="item.color"
          >
            <span v-tippy="item.disabled && item.disabledTooltip">
              <button
                :class="buildButtonClassses({ active, disabled, color: item.color })"
                :disabled="disabled"
                @click="chooseItem(item, $event)"
              >
                <Component :is="item.icon" v-if="item.icon" class="h-4 w-4" />
                <slot name="item" :item="item">{{ item.title }}</slot>
              </button>
            </span>
          </MenuItem>
        </div>
      </MenuItems>
    </Teleport>
  </HeadlessMenu>
</template>

<script setup lang="ts">
import { directive as vTippy } from 'vue-tippy'
import { Menu as HeadlessMenu, MenuButton, MenuItems, MenuItem } from '@headlessui/vue'
import type { Nullable } from '@speckle/shared'
import { computed, ref, watch, onMounted } from 'vue'
import {
  HorizontalDirection,
  useResponsiveHorizontalDirectionCalculation
} from '~~/src/composables/common/window'
import type { LayoutMenuItem } from '~~/src/helpers/layout/components'
import { useElementBounding, useEventListener } from '@vueuse/core'
import { useBodyMountedMenuPositioning } from '~~/src/composables/layout/menu'

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (e: 'chosen', val: { event: MouseEvent; item: LayoutMenuItem<any> }): void
}>()

const props = defineProps<{
  open?: boolean
  /**
   * 2D array so that items can be grouped with dividers between them
   */
  items: LayoutMenuItem[][]
  size?: 'base' | 'lg'
  menuId?: string
  /**
   * Preferable menu position/directed. This can change depending on available space.
   */
  menuPosition?: HorizontalDirection
  mountMenuOnBody?: boolean
}>()

const menuItems = ref(null as Nullable<{ el: HTMLDivElement }>)
const menuButton = ref(null as Nullable<{ el: HTMLButtonElement }>)
const menuButtonWrapper = ref(null as Nullable<HTMLElement>)
const isOpenInternally = ref(false)
const isMounted = ref(false)

const finalOpen = computed({
  get: () => props.open || false,
  set: (newVal) => emit('update:open', newVal)
})

const menuButtonBounding = useElementBounding(menuButtonWrapper, {
  windowResize: true,
  windowScroll: true,
  immediate: true
})

const { direction: calculatedDirection } = useResponsiveHorizontalDirectionCalculation({
  el: computed(() => menuItems.value?.el || null),
  defaultDirection: props.menuPosition,
  stopUpdatesBelowWidth: 300
})

const menuDirection = computed(() => {
  return props.menuPosition || calculatedDirection.value
})

const { menuStyle } = useBodyMountedMenuPositioning({
  menuOpenDirection: menuDirection,
  buttonBoundingBox: menuButtonBounding,
  menuWidth: computed(() => {
    switch (props.size) {
      case 'lg':
        return 208
      case 'base':
      default:
        return 176
    }
  })
})

const menuItemsStyles = computed(() => {
  // Only add styles for body mounted menus
  if (!props.mountMenuOnBody) return {}
  if (!menuButtonBounding.width.value) return {}

  return {
    position: 'fixed',
    zIndex: 50,
    ...menuStyle.value
  }
})

const menuItemsClasses = computed(() => {
  const classParts = [
    'mt-1 w-44 origin-top-right divide-y divide-outline-3 rounded-md bg-foundation shadow-lg border border-outline-2 z-50'
  ]

  if (props.mountMenuOnBody) {
    classParts.push('fixed')
  } else {
    classParts.push('absolute')

    if (menuDirection.value === HorizontalDirection.Left) {
      classParts.push('right-0')
    }
  }

  if (props.size === 'lg') {
    classParts.push('w-52')
  } else {
    classParts.push('w-44')
  }

  return classParts.join(' ')
})

const buildButtonClassses = (params: {
  active?: boolean
  disabled?: boolean
  color?: 'danger' | 'info'
}) => {
  const { active, disabled, color } = params
  const classParts = [
    'group flex space-x-2 w-full items-center rounded-md px-2 py-1 text-body-xs'
  ]

  if (active && !color) {
    classParts.push('bg-primary-muted text-foreground')
  } else if (disabled) {
    classParts.push('opacity-40')
  } else if (color === 'danger' && active) {
    classParts.push('text-foreground-on-primary bg-danger')
  } else if (color === 'danger' && !active) {
    classParts.push('text-danger')
  } else if (color === 'info' && active) {
    classParts.push('text-foreground-on-primary bg-info')
  } else if (color === 'info' && !active) {
    classParts.push('text-info')
  } else {
    classParts.push('text-foreground')
  }

  return classParts.join(' ')
}

const chooseItem = (item: LayoutMenuItem, event: MouseEvent) => {
  emit('chosen', { item, event })
}

const toggle = () => {
  menuButton.value?.el.click()
  if (props.mountMenuOnBody) {
    menuButtonBounding.update()
  }
}

// ok this is a bit hacky, but it's done because of headlessui's limited API
// the point of this is 1) cast any to bool 2) store 'open' state locally
// so that we can access it outside of the template
const processOpen = (val: unknown): val is boolean => {
  const isOpen = !!val
  isOpenInternally.value = isOpen
  return isOpen
}

watch(isOpenInternally, (newVal, oldVal) => {
  if (newVal === oldVal) return
  finalOpen.value = newVal
})

watch(finalOpen, (shouldBeOpen) => {
  if (shouldBeOpen && !isOpenInternally.value) {
    toggle()
  } else if (!shouldBeOpen && isOpenInternally.value) {
    toggle()
  }
})

onMounted(() => {
  isMounted.value = true
})

useEventListener(window, 'resize', () => {
  menuButtonBounding.update()
})

useEventListener(window, 'scroll', () => {
  menuButtonBounding.update()
})
</script>
