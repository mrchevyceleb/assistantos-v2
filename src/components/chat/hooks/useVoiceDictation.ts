/**
 * Voice Dictation Hook
 *
 * Handles Web Speech API for voice-to-text input in the chat.
 * Extracted from AgentChatContainer.tsx for better maintainability.
 */

import { useState, useRef, useEffect, useCallback } from 'react'

interface UseVoiceDictationOptions {
  /** Current input value */
  input: string
  /** Function to update input value */
  setInput: React.Dispatch<React.SetStateAction<string>>
  /** Function to show notifications */
  addNotification: (title: string, message: string, type: 'info' | 'success' | 'warning' | 'error') => void
}

interface UseVoiceDictationReturn {
  /** Whether voice recording is active */
  isRecording: boolean
  /** Interim transcript (partial results while speaking) */
  interimTranscript: string
  /** Start voice recording */
  startVoiceRecording: () => Promise<void>
  /** Stop voice recording */
  stopVoiceRecording: () => void
  /** Toggle voice recording on/off */
  toggleVoiceRecording: () => void
  /** Whether Web Speech API is supported */
  isSupported: boolean
}

export function useVoiceDictation({
  input,
  setInput,
  addNotification
}: UseVoiceDictationOptions): UseVoiceDictationReturn {
  // Voice dictation state
  const [isRecording, setIsRecording] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [isSupported, setIsSupported] = useState(false)

  // Refs
  const recognitionRef = useRef<any>(null)
  const recordingStartInputRef = useRef<string>('') // Store input when recording starts
  const isRecordingRef = useRef<boolean>(false) // Ref for onend handler to avoid stale closure

  // Initialize Web Speech API (ONCE - no dependencies to avoid recreation)
  useEffect(() => {
    // Check for browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setIsSupported(false)
      return
    }

    setIsSupported(true)

    // Create recognition instance
    const recognition = new SpeechRecognition()
    recognition.continuous = true // Keep listening until stopped
    recognition.interimResults = true // Get partial results while speaking
    recognition.lang = 'en-US' // Default to English

    // Handle results
    recognition.onresult = (event: any) => {
      let interimText = ''
      let finalText = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalText += transcript + ' '
        } else {
          interimText += transcript
        }
      }

      // Update interim transcript for visual feedback
      setInterimTranscript(interimText)

      // Append final results to input
      if (finalText) {
        setInput(prevInput => {
          const baseInput = recordingStartInputRef.current
          const currentFinalText = prevInput.slice(baseInput.length).trim()
          const newFinalText = (currentFinalText + ' ' + finalText).trim()
          return baseInput + (baseInput && newFinalText ? ' ' : '') + newFinalText
        })
        setInterimTranscript('')
      }
    }

    // Handle errors
    recognition.onerror = (event: any) => {
      console.error('[Voice] Speech recognition error:', event.error)

      if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        addNotification(
          'Microphone Permission Denied',
          'Please grant microphone access to use voice dictation',
          'error'
        )
      } else if (event.error === 'no-speech') {
        // Don't stop recording on no-speech - let user decide when to stop
        return
      } else if (event.error === 'network') {
        addNotification(
          'Network Error',
          'Voice recognition requires an internet connection',
          'error'
        )
      } else {
        addNotification(
          'Voice Recognition Error',
          `An error occurred: ${event.error}`,
          'error'
        )
      }

      setIsRecording(false)
      isRecordingRef.current = false
      setInterimTranscript('')
    }

    // Handle end of recognition - restart if still recording
    recognition.onend = () => {
      if (isRecordingRef.current) {
        try {
          recognition.start()
        } catch {
          // Recognition already started or error - ignore
        }
      }
    }

    recognitionRef.current = recognition

    // Cleanup
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [setInput, addNotification]) // Dependencies for callbacks used in event handlers

  // Start voice recording
  const startVoiceRecording = useCallback(async () => {
    if (!recognitionRef.current) {
      addNotification(
        'Voice Input Not Supported',
        'Your browser does not support voice input. Try Chrome or Edge.',
        'error'
      )
      return
    }

    try {
      // Store current input so we can append to it
      recordingStartInputRef.current = input

      // Set BOTH state and ref (ref for onend handler)
      setIsRecording(true)
      isRecordingRef.current = true
      setInterimTranscript('')

      recognitionRef.current.start()

      addNotification(
        'Voice Recording Started',
        'Speak your message. Click the microphone again to stop.',
        'info'
      )
    } catch (error) {
      console.error('[Voice] Error starting recognition:', error)
      addNotification(
        'Recording Failed',
        'Could not start voice recording. Please try again.',
        'error'
      )
      setIsRecording(false)
      isRecordingRef.current = false
    }
  }, [input, addNotification])

  // Stop voice recording
  const stopVoiceRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }

    // Set BOTH state and ref
    setIsRecording(false)
    isRecordingRef.current = false
    setInterimTranscript('')

    addNotification(
      'Voice Recording Stopped',
      'Your message has been transcribed.',
      'success'
    )
  }, [addNotification])

  // Toggle voice recording
  const toggleVoiceRecording = useCallback(() => {
    if (isRecording) {
      stopVoiceRecording()
    } else {
      startVoiceRecording()
    }
  }, [isRecording, startVoiceRecording, stopVoiceRecording])

  return {
    isRecording,
    interimTranscript,
    startVoiceRecording,
    stopVoiceRecording,
    toggleVoiceRecording,
    isSupported
  }
}
