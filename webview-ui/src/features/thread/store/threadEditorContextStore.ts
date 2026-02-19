import type { ContextEditorStateMessage } from '@agent/types'
import { create } from 'zustand'

type ThreadEditorContextState = {
  hasActiveEditor: boolean
  fileName: string | null
  selectedLineCount: number
  lastUpdatedAt: number
}

type ThreadEditorContextActions = {
  setEditorContextState: (payload: ContextEditorStateMessage['payload']) => void
  resetEditorContextState: () => void
}

type ThreadEditorContextStore = ThreadEditorContextState & { actions: ThreadEditorContextActions }

const initialState: ThreadEditorContextState = {
  hasActiveEditor: false,
  fileName: null,
  selectedLineCount: 0,
  lastUpdatedAt: 0,
}

const useThreadEditorContextStore = create<ThreadEditorContextStore>(set => ({
  ...initialState,
  actions: {
    setEditorContextState: payload => {
      set({
        hasActiveEditor: payload.hasActiveEditor,
        fileName: payload.fileName,
        selectedLineCount: payload.selectedLineCount,
        lastUpdatedAt: payload.timestamp,
      })
    },
    resetEditorContextState: () => {
      set(initialState)
    },
  },
}))

export const useThreadEditorContextActions = () => useThreadEditorContextStore(state => state.actions)

export const useEditorContextHasActiveEditor = () => useThreadEditorContextStore(state => state.hasActiveEditor)

export const useEditorContextLabel = () =>
  useThreadEditorContextStore(state => {
    if (state.selectedLineCount > 0) {
      return `${state.selectedLineCount} lines selected`
    }
    if (state.hasActiveEditor && state.fileName) {
      return state.fileName
    }
    return 'No active file'
  })
