/**
 * useSpeechRecognition Hook
 *
 * Custom hook for voice-to-text using the Web Speech API.
 * Provides recording state, transcription results, and error handling.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// TypeScript definitions for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message?: string
}

interface SpeechRecognitionResult {
  isFinal: boolean
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionResultList {
  length: number
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition
}

// Get the SpeechRecognition constructor from window
const getSpeechRecognition = (): SpeechRecognitionConstructor | null => {
  if (typeof window === 'undefined') return null

  // Chrome, Edge, and modern browsers
  const SpeechRecognition = (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition

  return SpeechRecognition || null
}

export interface UseSpeechRecognitionReturn {
  /** Whether speech recognition is supported in this browser */
  isSupported: boolean
  /** Whether currently recording */
  isRecording: boolean
  /** The transcribed text (accumulates during recording) */
  transcript: string
  /** Interim results while speaking */
  interimTranscript: string
  /** Error message if something went wrong */
  error: string | null
  /** Start recording */
  startRecording: () => void
  /** Stop recording */
  stopRecording: () => void
  /** Toggle recording on/off */
  toggleRecording: () => void
  /** Clear the transcript and error */
  reset: () => void
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isSupported, setIsSupported] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const isStoppingRef = useRef(false)

  // Check browser support on mount
  useEffect(() => {
    const SpeechRecognition = getSpeechRecognition()
    setIsSupported(SpeechRecognition !== null)
  }, [])

  // Initialize recognition instance
  const initRecognition = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition()
    if (!SpeechRecognition) return null

    const recognition = new SpeechRecognition()

    // Configure recognition
    recognition.continuous = true // Keep listening until stopped
    recognition.interimResults = true // Get results as user speaks
    recognition.lang = 'en-US' // Default to English

    recognition.onstart = () => {
      setIsRecording(true)
      setError(null)
      isStoppingRef.current = false
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = ''
      let interimText = ''

      // Process all results
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscript += result[0].transcript
        } else {
          interimText += result[0].transcript
        }
      }

      // Append final transcript
      if (finalTranscript) {
        setTranscript(prev => prev + finalTranscript)
      }

      // Update interim transcript
      setInterimTranscript(interimText)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // Ignore abort errors when intentionally stopping
      if (event.error === 'aborted' && isStoppingRef.current) {
        return
      }

      let errorMessage = 'Speech recognition error'

      switch (event.error) {
        case 'no-speech':
          errorMessage = 'No speech detected. Please try again.'
          break
        case 'audio-capture':
          errorMessage = 'No microphone found. Please check your audio input.'
          break
        case 'not-allowed':
          errorMessage = 'Microphone access denied. Please allow microphone permissions.'
          break
        case 'network':
          errorMessage = 'Network error. Speech recognition requires internet connection.'
          break
        case 'aborted':
          errorMessage = 'Recording was cancelled.'
          break
        default:
          errorMessage = `Error: ${event.error}`
      }

      setError(errorMessage)
      setIsRecording(false)
    }

    recognition.onend = () => {
      setIsRecording(false)
      setInterimTranscript('')
    }

    return recognition
  }, [])

  const startRecording = useCallback(() => {
    if (!isSupported) {
      setError('Speech recognition is not supported in this browser. Try Chrome or Edge.')
      return
    }

    // Clear previous state
    setTranscript('')
    setInterimTranscript('')
    setError(null)

    // Create new recognition instance
    const recognition = initRecognition()
    if (!recognition) {
      setError('Failed to initialize speech recognition.')
      return
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
    } catch (e) {
      setError('Failed to start recording. Please try again.')
      console.error('Speech recognition start error:', e)
    }
  }, [isSupported, initRecognition])

  const stopRecording = useCallback(() => {
    isStoppingRef.current = true

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {
        // Ignore errors when stopping
      }
      recognitionRef.current = null
    }

    setIsRecording(false)
    setInterimTranscript('')
  }, [])

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  const reset = useCallback(() => {
    stopRecording()
    setTranscript('')
    setInterimTranscript('')
    setError(null)
  }, [stopRecording])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        isStoppingRef.current = true
        recognitionRef.current.abort()
        recognitionRef.current = null
      }
    }
  }, [])

  return {
    isSupported,
    isRecording,
    transcript,
    interimTranscript,
    error,
    startRecording,
    stopRecording,
    toggleRecording,
    reset
  }
}
