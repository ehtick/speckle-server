<template>
  <main class="flex items-center justify-center">
    <div class="absolute inset-0 pointer-events-none px-4 py-3">
      <div class="flex justify-between">
        <LogoBlock />
        <div class="flex gap-2 items-center">
          <FormButton size="sm" text class="pointer-events-auto" @click="toggleTheme">
            <Icon class="w-4 h-4" />
          </FormButton>
          <FormButton
            size="sm"
            text
            class="pointer-events-auto"
            @click="() => copyReference()"
          >
            <WrenchIcon class="w-4 h-4" />
          </FormButton>
        </div>
      </div>
    </div>
    <div class="relative my-12 mx-4 w-full max-w-sm">
      <slot />
    </div>
  </main>
</template>
<script setup lang="ts">
import { SunIcon, MoonIcon, WrenchIcon } from '@heroicons/vue/24/solid'
import LogoBlock from '~/components/header/LogoBlock.vue'
import { useGenerateErrorReference } from '~/lib/core/composables/error'
import { useTheme } from '~~/lib/core/composables/theme'

const { isDarkTheme, toggleTheme } = useTheme()
const { copyReference } = useGenerateErrorReference()
const Icon = computed(() => (isDarkTheme.value ? SunIcon : MoonIcon))
</script>
