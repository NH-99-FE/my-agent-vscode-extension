import { bridge } from '@/lib/bridge'
import { useEffect } from 'react'
import { useThreadEditorContextActions } from '../store/threadEditorContextStore'

export function useEditorContextSubscription(): void {
  const { setEditorContextState, resetEditorContextState } = useThreadEditorContextActions()

  useEffect(() => {
    const dispose = bridge.onMessage(message => {
      if (message.type !== 'context.editor.state') {
        return
      }
      setEditorContextState(message.payload)
    })

    bridge.send({
      type: 'context.editor.state.subscribe',
      requestId: crypto.randomUUID(),
    })

    return () => {
      bridge.send({
        type: 'context.editor.state.unsubscribe',
      })
      dispose()
      resetEditorContextState()
    }
  }, [resetEditorContextState, setEditorContextState])
}
