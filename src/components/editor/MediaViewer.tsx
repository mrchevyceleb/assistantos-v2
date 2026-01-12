import { useEffect, useState, useRef } from 'react'
import { X, ZoomIn, ZoomOut, RotateCcw, Image, Film, Music, FileQuestion, Maximize2, Minimize2, Loader2 } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { getMediaType, getMimeType, getFileExtension } from '../../utils/fileTypes'

interface MediaInfo {
  size: number
  width?: number
  height?: number
  duration?: number
}

export function MediaViewer() {
  const { currentFile, closeFile } = useAppStore()
  const [zoom, setZoom] = useState(100)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const fileName = currentFile?.split(/[\\/]/).pop() || ''
  const mediaType = currentFile ? getMediaType(currentFile) : 'unknown'
  const mimeType = currentFile ? getMimeType(currentFile) : ''
  const fileExtension = currentFile ? getFileExtension(currentFile).toUpperCase().slice(1) : ''

  // Load media file as base64 data URL when file changes
  useEffect(() => {
    setZoom(100)
    setMediaInfo(null)
    setError(null)
    setIsFullscreen(false)
    setDataUrl(null)

    if (!currentFile || !mimeType) return

    const loadMedia = async () => {
      setIsLoading(true)
      try {
        const result = await window.electronAPI.fs.readFileBase64(currentFile)
        if (result.success && result.data) {
          setDataUrl(`data:${mimeType};base64,${result.data}`)
        } else {
          setError(result.error || 'Failed to load media file')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load media file')
      } finally {
        setIsLoading(false)
      }
    }

    loadMedia()
  }, [currentFile, mimeType])

  // Handle image load to get dimensions
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setMediaInfo(prev => ({
      ...prev || { size: 0 },
      width: img.naturalWidth,
      height: img.naturalHeight,
    }))
  }

  // Handle video metadata load
  const handleVideoMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget
    setMediaInfo(prev => ({
      ...prev || { size: 0 },
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
    }))
  }

  // Handle audio metadata load
  const handleAudioMetadata = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = e.currentTarget
    setMediaInfo(prev => ({
      ...prev || { size: 0 },
      duration: audio.duration,
    }))
  }

  // Zoom controls
  const zoomIn = () => setZoom(z => Math.min(z + 25, 400))
  const zoomOut = () => setZoom(z => Math.max(z - 25, 25))
  const resetZoom = () => setZoom(100)

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return

    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen()
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      }
    }
  }

  // Listen for fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Format duration for display
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Get icon for media type
  const getMediaIcon = () => {
    switch (mediaType) {
      case 'image': return <Image className="w-4 h-4 text-cyan-400" />
      case 'video': return <Film className="w-4 h-4 text-violet-400" />
      case 'audio': return <Music className="w-4 h-4 text-pink-400" />
      default: return <FileQuestion className="w-4 h-4 text-slate-400" />
    }
  }

  // Render media content
  const renderMedia = () => {
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-red-400">
          <FileQuestion className="w-12 h-12 mb-4" />
          <p className="text-lg mb-2">Failed to load media</p>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      )
    }

    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-400">
          <Loader2 className="w-12 h-12 mb-4 animate-spin" />
          <p className="text-lg">Loading media...</p>
        </div>
      )
    }

    if (!dataUrl) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-400">
          <FileQuestion className="w-12 h-12 mb-4" />
          <p className="text-lg">No media loaded</p>
        </div>
      )
    }

    switch (mediaType) {
      case 'image':
        return (
          <div className="flex items-center justify-center h-full overflow-auto p-4">
            <img
              ref={imageRef}
              src={dataUrl}
              alt={fileName}
              className="max-w-none object-contain transition-transform duration-200"
              style={{
                transform: `scale(${zoom / 100})`,
                maxHeight: zoom <= 100 ? '100%' : 'none',
                maxWidth: zoom <= 100 ? '100%' : 'none',
              }}
              onLoad={handleImageLoad}
              onError={() => setError('Unable to load image')}
              draggable={false}
            />
          </div>
        )

      case 'video':
        return (
          <div className="flex items-center justify-center h-full p-4">
            <video
              ref={videoRef}
              src={dataUrl}
              controls
              className="max-w-full max-h-full rounded-lg shadow-lg"
              style={{
                transform: `scale(${zoom / 100})`,
              }}
              onLoadedMetadata={handleVideoMetadata}
              onError={() => setError('Unable to load video')}
            >
              <source src={dataUrl} type={mimeType} />
              Your browser does not support the video tag.
            </video>
          </div>
        )

      case 'audio':
        return (
          <div className="flex flex-col items-center justify-center h-full p-8">
            {/* Album art placeholder */}
            <div
              className="w-48 h-48 rounded-2xl mb-8 flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(236, 72, 153, 0.3) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <Music className="w-20 h-20 text-pink-400/50" />
            </div>

            {/* Audio player */}
            <div className="w-full max-w-md">
              <audio
                controls
                className="w-full"
                onLoadedMetadata={handleAudioMetadata}
                onError={() => setError('Unable to load audio')}
              >
                <source src={dataUrl} type={mimeType} />
                Your browser does not support the audio tag.
              </audio>
            </div>

            {/* File info below player */}
            <div className="mt-6 text-center">
              <p className="text-lg font-medium text-slate-200">{fileName}</p>
              {mediaInfo?.duration && (
                <p className="text-sm text-slate-500 mt-1">
                  Duration: {formatDuration(mediaInfo.duration)}
                </p>
              )}
            </div>
          </div>
        )

      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <FileQuestion className="w-12 h-12 mb-4" />
            <p className="text-lg mb-2">Unsupported media type</p>
            <p className="text-sm text-slate-500">{fileExtension || 'Unknown format'}</p>
          </div>
        )
    }
  }

  if (!currentFile) {
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center"
        style={{
          background: 'linear-gradient(180deg, rgba(16, 20, 32, 0.95) 0%, rgba(10, 13, 22, 0.98) 100%)'
        }}
      >
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5"
          style={{
            background: 'linear-gradient(180deg, rgba(30, 40, 60, 0.6) 0%, rgba(20, 28, 45, 0.7) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.06)'
          }}
        >
          <Image className="w-10 h-10 text-slate-500" />
        </div>
        <p className="text-lg font-medium mb-2 text-slate-300">No media file selected</p>
        <p className="text-sm text-slate-500">Select an image, video, or audio file from the sidebar</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col"
      style={{
        background: 'linear-gradient(180deg, rgba(16, 20, 32, 0.95) 0%, rgba(10, 13, 22, 0.98) 100%)'
      }}
    >
      {/* Header */}
      <div
        className="h-12 flex items-center px-4 gap-2"
        style={{
          background: 'linear-gradient(180deg, rgba(20, 27, 45, 0.9) 0%, rgba(12, 15, 26, 0.95) 100%)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
        }}
      >
        <div className="flex items-center gap-2 flex-1">
          {getMediaIcon()}
          <span className="text-sm text-slate-300 font-medium truncate">{fileName}</span>
          <span className="text-xs text-slate-500 px-2 py-0.5 rounded bg-white/5">
            {fileExtension}
          </span>
        </div>
        <button
          onClick={closeFile}
          className="p-2 rounded-lg hover:bg-white/5 transition-colors text-slate-400"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Toolbar - only show for images and videos */}
      {(mediaType === 'image' || mediaType === 'video') && (
        <div
          className="h-10 flex items-center justify-between px-4"
          style={{
            background: 'rgba(15, 20, 35, 0.8)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.04)'
          }}
        >
          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={zoomOut}
              disabled={zoom <= 25}
              className="p-1.5 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-200 disabled:text-slate-600 disabled:hover:bg-transparent"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-500 min-w-[50px] text-center">
              {zoom}%
            </span>
            <button
              onClick={zoomIn}
              disabled={zoom >= 400}
              className="p-1.5 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-200 disabled:text-slate-600 disabled:hover:bg-transparent"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            {zoom !== 100 && (
              <button
                onClick={resetZoom}
                className="p-1.5 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-200 ml-1"
                title="Reset zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* File info */}
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {mediaInfo?.width && mediaInfo?.height && (
              <span>{mediaInfo.width} x {mediaInfo.height}</span>
            )}
            {mediaInfo?.duration && (
              <span>{formatDuration(mediaInfo.duration)}</span>
            )}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-slate-200"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Media content */}
      <div className="flex-1 overflow-hidden">
        {renderMedia()}
      </div>
    </div>
  )
}
