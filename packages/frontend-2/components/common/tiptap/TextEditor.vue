<!-- eslint-disable vuejs-accessibility/click-events-have-key-events -->
<!-- eslint-disable vuejs-accessibility/no-static-element-interactions -->
<template>
  <div
    :class="[
      'text-editor flex flex-col relative',
      !!readonly ? 'text-editor--read-only' : ''
    ]"
    @click.capture="onRootClick"
  >
    <FormButton
      v-if="unlinkVisible"
      size="sm"
      class="absolute top-1 right-1 z-10"
      color="outline"
      @click="onUnlink"
    >
      Remove link
    </FormButton>

    <LayoutDialog
      v-model:open="externalLinkDialogOpen"
      max-width="xs"
      :buttons="externalLinkDialogButtons"
    >
      <template #header>Leaving Speckle</template>
      <p class="mb-2">You're about to open the link below in a new tab:</p>
      <div class="p-3 bg-highlight-2 rounded-md font-mono break-all">
        {{ externalLinkDialogUrl }}
      </div>
      <p class="mt-2 mb-4">
        This is an external website. Speckle is not responsible for its content or
        security.
      </p>
      <p class="font-medium">Do you want to continue?</p>
    </LayoutDialog>

    <EditorContent
      ref="editorContentRef"
      class="simple-scrollbar flex flex-1"
      :editor="editor"
      :style="maxHeight ? `max-height: ${maxHeight}; overflow-y: auto;` : ''"
      @click="onEditorContentClick"
      @keydown.stop="onKeyDownHandler"
    />
    <div v-if="$slots.actions && !readonly">
      <slot name="actions" />
    </div>
  </div>
</template>
<script setup lang="ts">
import { EditorContent, Editor } from '@tiptap/vue-3'
import type { JSONContent } from '@tiptap/core'
import { getEditorExtensions } from '~~/lib/common/helpers/tiptap'
import type {
  EnterKeypressTrackerExtensionStorage,
  TiptapEditorSchemaOptions
} from '~~/lib/common/helpers/tiptap'
import type { Nullable } from '@speckle/shared'
// import { userProfileRoute } from '~~/lib/common/helpers/route'
import { onKeyDown } from '@vueuse/core'
import { noop } from 'lodash-es'
import {
  FormButton,
  LayoutDialog,
  type LayoutDialogButton
} from '@speckle/ui-components'

const emit = defineEmits<{
  (e: 'update:modelValue', val: JSONContent): void
  (e: 'submit', val: { data: JSONContent }): void
  (e: 'created'): void
  (e: 'keydown', val: KeyboardEvent): void
}>()

const props = defineProps<{
  modelValue?: JSONContent | null
  schemaOptions?: TiptapEditorSchemaOptions
  maxHeight?: string
  autofocus?: boolean
  disabled?: boolean
  placeholder?: string
  readonly?: boolean
  /**
   * Used to scope things like user mentions to project collaborators etc.
   */
  projectId?: string
}>()

const editorContentRef = ref(null as Nullable<HTMLElement>)
const unlinkVisible = ref(false)
const externalLinkDialogOpen = ref(false)
const externalLinkDialogUrl = ref('')

const externalLinkDialogButtons = computed((): LayoutDialogButton[] => [
  {
    text: 'Cancel',
    props: { color: 'outline' },
    onClick: () => (externalLinkDialogOpen.value = false)
  },
  {
    text: 'Continue',
    props: { color: 'danger' },
    onClick: () => {
      window.open(externalLinkDialogUrl.value, '_blank', 'noopener,noreferrer')
      externalLinkDialogOpen.value = false
    }
  }
])

const isMultiLine = computed(() => !!props.schemaOptions?.multiLine)
const isEditable = computed(() => !props.disabled && !props.readonly)
const hasEnterTracking = computed(() => !props.readonly && !isMultiLine.value)

const editor = new Editor({
  content: props.modelValue,
  autofocus: props.autofocus,
  editable: isEditable.value,
  extensions: getEditorExtensions(props.schemaOptions, {
    placeholder: props.placeholder,
    projectId: props.projectId
  }),
  onUpdate: () => {
    const data = getData()
    if (!data || Object.keys(data).length < 1) return
    emit('update:modelValue', data)
  },
  onCreate: () => {
    emit('created')
  }
})

const enterKeypressTracker = editor.storage
  .enterKeypressTracker as EnterKeypressTrackerExtensionStorage
const getData = (): JSONContent => editor.getJSON()
const onEnter = () => {
  if (isMultiLine.value || props.readonly) return
  emit('submit', { data: getData() })
}
const onKeyDownHandler = (e: KeyboardEvent) => emit('keydown', e)

const updateUnlinkVisible = () => {
  unlinkVisible.value = !props.readonly && editor.isActive('link')
}

const onUnlink = () => {
  editor.chain().extendMarkRange('link').unsetLink().focus().run()
  updateUnlinkVisible()
}

editor.on('selectionUpdate', updateUnlinkVisible)
editor.on('transaction', updateUnlinkVisible)

const onEditorContentClick = (e: MouseEvent) => {
  const closestSelectorTarget = (e.target as HTMLElement).closest(
    '.editor-mention'
  ) as Nullable<HTMLElement>
  if (!closestSelectorTarget) return

  onMentionClick(closestSelectorTarget.dataset.id as string, e)
  e.stopPropagation()
}

const onRootClick = (e: MouseEvent) => {
  if (!props.readonly) return

  const anchor = (e.target as HTMLElement).closest('a') as Nullable<HTMLAnchorElement>
  if (!anchor) return

  // Only react to left-clicks without modifier keys
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

  e.preventDefault()
  const url = new URL(anchor.href, window.location.href)
  if (url.origin === window.location.origin) return // treat as internal
  externalLinkDialogUrl.value = anchor.href
  externalLinkDialogOpen.value = true
}

// TODO: No profile page to link to in FE2 yet
// const onMentionClick = (userId: string, e: MouseEvent) => {
//   if (!props.readonly) return

//   const path = userProfileRoute(userId)
//   const isMetaKey = e.metaKey || e.ctrlKey
//   if (isMetaKey) {
//     window.open(path, '_blank')
//   } else {
//     window.location.href = path
//   }
// }
const onMentionClick = noop

onKeyDown(
  'Escape',
  (e) => {
    // TipTap handles Escape, we don't want this to bubble up and close the thread
    e.stopImmediatePropagation()
    e.stopPropagation()
  },
  { target: editorContentRef }
)

watch(
  () => hasEnterTracking.value,
  (hasEnterTracking) => {
    if (hasEnterTracking) {
      enterKeypressTracker.subscribe(editor, onEnter)
    } else {
      enterKeypressTracker.unsubscribe(editor, onEnter)
    }
  },
  { immediate: true }
)

watch(
  () => props.modelValue,
  (newVal) => {
    const isSame = JSON.stringify(newVal) === JSON.stringify(getData())
    if (isSame) return

    editor.commands.setContent(newVal || '')
  }
)

watch(
  () => isEditable.value,
  (isEditable) => {
    editor.setEditable(isEditable)
  }
)

onBeforeUnmount(() => {
  editor.destroy()
  enterKeypressTracker.unsubscribe(editor, onEnter)
})
</script>
<style lang="postcss">
/* stylelint-disable selector-class-pattern */
.ProseMirror-focused {
  outline: none;
}

.ProseMirror {
  flex: 1;

  & p:last-of-type {
    margin-bottom: 0;
  }

  & p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    float: left;
    pointer-events: none;
    height: 0;
    @apply text-foreground-disabled;
  }

  & .editor-mention {
    box-decoration-break: clone;
    @apply text-foreground text-body-2xs font-semibold;
  }

  & a {
    @apply border-b border-outline-3 hover:border-outline-5;
  }
}

.text-editor {
  &--read-only {
    word-break: break-word;
    background-color: unset !important;
    box-shadow: unset !important;
  }
}
</style>
