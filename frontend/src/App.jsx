import { useState, useEffect, useRef } from 'react'
import { Activity, Play, Square, RefreshCw, Smartphone, Terminal, XCircle } from 'lucide-react'
import axios from 'axios'

const API_URL = 'http://localhost:8000'

function App() {
  const [devices, setDevices] = useState([])
  const [logs, setLogs] = useState([])
  const [isRunning, setIsRunning] = useState(false)
  const [selectedDevice, setSelectedDevice] = useState(null)
  const wsRef = useRef(null)
  const logsEndRef = useRef(null)

  const fetchDevices = async () => {
    try {
      const response = await axios.get(`${API_URL}/devices`)
      setDevices(response.data)
      if (response.data.length > 0 && !selectedDevice) {
        setSelectedDevice(response.data[0])
      }
    } catch (error) {
      console.error('Error fetching devices:', error)
    }
  }

  const [appiumRunning, setAppiumRunning] = useState(false)

  const checkAppiumStatus = async () => {
    try {
      const response = await axios.get(`${API_URL}/appium/status`)
      setAppiumRunning(response.data.running)
    } catch (error) {
      console.error('Error checking Appium status:', error)
    }
  }

  const toggleAppium = async () => {
    try {
      if (appiumRunning) {
        await axios.post(`${API_URL}/appium/stop`)
      } else {
        await axios.post(`${API_URL}/appium/start`)
      }
      // Wait a bit for status to update
      setTimeout(checkAppiumStatus, 1000)
    } catch (error) {
      console.error('Error toggling Appium:', error)
    }
  }

  const [scrcpyStatus, setScrcpyStatus] = useState({})

  const checkScrcpyStatus = async (udid) => {
    try {
      const response = await axios.get(`${API_URL}/scrcpy/status/${udid}`)
      setScrcpyStatus(prev => ({ ...prev, [udid]: response.data.running }))
    } catch (error) {
      console.error(`Error checking Scrcpy status for ${udid}:`, error)
    }
  }

  const toggleScrcpy = async (device) => {
    try {
      const isRunning = scrcpyStatus[device.udid]
      if (isRunning) {
        await axios.post(`${API_URL}/scrcpy/stop`, device)
      } else {
        await axios.post(`${API_URL}/scrcpy/start`, device)
      }
      // Wait a bit and check status
      setTimeout(() => checkScrcpyStatus(device.udid), 1000)
    } catch (error) {
      console.error(`Error toggling Scrcpy for ${device.udid}:`, error)
    }
  }

  useEffect(() => {
    fetchDevices()
    checkAppiumStatus()
    const interval = setInterval(() => {
      checkAppiumStatus()
      // We'll check scrcpy status for connected devices here if needed, 
      // but for now let's just do it on load/refresh to save requests
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  // Update scrcpy status when devices change
  useEffect(() => {
    devices.forEach(d => checkScrcpyStatus(d.udid))
  }, [devices])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const runTest = async () => {
    if (!selectedDevice || !selectedTestPath) {
      alert('Please select a device and a test/suite')
      return
    }

    // Resolve absolute path from backend
    try {
      const pathRes = await axios.get(`${API_URL}/files/resolve`, {
        params: { path: selectedTestPath, mode: testMode }
      })

      if (pathRes.data.error) {
        alert('Invalid test path')
        return
      }

      setIsRunning(true)
      setLogs([])

      const ws = new WebSocket(`ws://localhost:8000/ws/run`)
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({
          devices: [selectedDevice.udid],
          test_path: pathRes.data.absolute_path,
          mode: testMode === 'suite' ? 'Suite' : 'Test'
        }))
      }

      ws.onmessage = (event) => {
        setLogs(prev => [...prev, event.data])
      }

      ws.onclose = () => {
        setIsRunning(false)
        setLogs(prev => [...prev, "--- Connection Closed ---"])
      }
    } catch (error) {
      console.error('Error resolving test path:', error)
      alert('Failed to resolve test path')
    }
  }

  const stopTest = () => {
    if (wsRef.current) {
      wsRef.current.close()
    }
  }

  const [inspectorData, setInspectorData] = useState(null)
  const [inspectingDevice, setInspectingDevice] = useState(null)
  const [selectedElement, setSelectedElement] = useState(null)

  const captureInspector = async (device) => {
    setInspectingDevice(device)
    setInspectorData(null)
    setSelectedElement(null)
    try {
      const response = await axios.post(`${API_URL}/inspector/capture`, device)
      setInspectorData(response.data)
    } catch (error) {
      console.error('Error capturing inspector:', error)
      setInspectingDevice(null)
    }
  }

  const closeInspector = () => {
    setInspectingDevice(null)
    setInspectorData(null)
    setSelectedElement(null)
  }

  const imgRef = useRef(null)
  const [imgScale, setImgScale] = useState({ x: 1, y: 1 })

  const [perfDevice, setPerfDevice] = useState(null)
  const [perfPackage, setPerfPackage] = useState('')
  const [perfData, setPerfData] = useState([])
  const [isMonitoring, setIsMonitoring] = useState(false)
  const perfWsRef = useRef(null)

  // Test Selector State
  const [testMode, setTestMode] = useState('suite') // 'suite' or 'test'
  const [currentPath, setCurrentPath] = useState('')
  const [fileItems, setFileItems] = useState([])
  const [canGoUp, setCanGoUp] = useState(false)
  const [selectedTestPath, setSelectedTestPath] = useState(null)

  // Browse files
  const browseFiles = async (path = '', mode = testMode) => {
    try {
      const response = await axios.get(`${API_URL}/files/browse`, {
        params: { path, mode }
      })
      setFileItems(response.data.items)
      setCurrentPath(response.data.current_path)
      setCanGoUp(response.data.can_go_up)
    } catch (error) {
      console.error('Error browsing files:', error)
    }
  }

  const navigateTo = (item) => {
    if (item.type === 'directory') {
      browseFiles(item.path, testMode)
    } else {
      setSelectedTestPath(item.path)
    }
  }

  const navigateUp = () => {
    if (!canGoUp) return
    const parentPath = currentPath.split('/').slice(0, -1).join('/')
    browseFiles(parentPath, testMode)
  }

  const handleModeChange = (mode) => {
    setTestMode(mode)
    setCurrentPath('')
    browseFiles('', mode)
  }

  // Load initial file list
  useEffect(() => {
    browseFiles('', testMode)
  }, [])

  // ADB Wireless State
  const [adbIp, setAdbIp] = useState('')
  const [adbPort, setAdbPort] = useState('5555')
  const [adbPairingPort, setAdbPairingPort] = useState('')
  const [adbCode, setAdbCode] = useState('')
  const [adbMessage, setAdbMessage] = useState('')

  const pairDevice = async () => {
    if (!adbIp || !adbPairingPort || !adbCode) {
      setAdbMessage('Please fill in all fields for pairing')
      return
    }
    try {
      const response = await axios.post(`${API_URL}/adb/pair`, null, {
        params: { ip: adbIp, port: adbPairingPort, code: adbCode }
      })
      setAdbMessage(response.data.message)
      if (response.data.success) {
        setAdbCode('') // Clear code on success
      }
    } catch (error) {
      setAdbMessage(`Error: ${error.message}`)
    }
  }

  const connectDevice = async () => {
    if (!adbIp || !adbPort) {
      setAdbMessage('Please fill in IP and Port')
      return
    }
    try {
      const response = await axios.post(`${API_URL}/adb/connect`, null, {
        params: { ip: adbIp, port: adbPort }
      })
      setAdbMessage(response.data.message)
      if (response.data.success) {
        // Refresh devices to show the newly connected device
        setTimeout(fetchDevices, 1000)
      }
    } catch (error) {
      setAdbMessage(`Error: ${error.message}`)
    }
  }

  const disconnectDevice = async () => {
    if (!selectedDevice || !selectedDevice.udid.includes(':')) {
      setAdbMessage('Please select a wireless device to disconnect')
      return
    }
    try {
      const response = await axios.post(`${API_URL}/adb/disconnect`, null, {
        params: { ip_port: selectedDevice.udid }
      })
      setAdbMessage(response.data.message)
      if (response.data.success) {
        setTimeout(fetchDevices, 1000)
      }
    } catch (error) {
      setAdbMessage(`Error: ${error.message}`)
    }
  }

  // Screenshot & Recording State
  const [recordingStatus, setRecordingStatus] = useState({}) // udid -> boolean
  const [screenshotPreview, setScreenshotPreview] = useState(null) // {url, filename}

  const takeScreenshot = async (device) => {
    try {
      const response = await axios.post(`${API_URL}/screenshot/${device.udid}`)
      if (response.data.success) {
        // Show preview
        setScreenshotPreview({ url: `${API_URL}${response.data.url}`, filename: response.data.filename })
      } else {
        alert(response.data.message)
      }
    } catch (error) {
      alert(`Screenshot error: ${error.message}`)
    }
  }

  const toggleRecording = async (device) => {
    const isRecording = recordingStatus[device.udid]
    try {
      if (isRecording) {
        // Stop recording
        const response = await axios.post(`${API_URL}/recording/stop/${device.udid}`)
        if (response.data.success) {
          // Download the recording
          window.open(`${API_URL}${response.data.url}`, '_blank')
        }
        setRecordingStatus(prev => ({ ...prev, [device.udid]: false }))
      } else {
        // Start recording
        const response = await axios.post(`${API_URL}/recording/start/${device.udid}`)
        if (response.data.success) {
          setRecordingStatus(prev => ({ ...prev, [device.udid]: true }))
        } else {
          alert(response.data.message)
        }
      }
    } catch (error) {
      alert(`Recording error: ${error.message}`)
      setRecordingStatus(prev => ({ ...prev, [device.udid]: false }))
    }
  }


  const openPerformance = (device) => {
    setPerfDevice(device)
    setPerfData([])
    setIsMonitoring(false)
  }

  // ADB Commands State
  const [adbCommand, setAdbCommand] = useState('')
  const [commonCommands, setCommonCommands] = useState([])
  const [commandOutput, setCommandOutput] = useState('')

  // Load common commands on mount
  useEffect(() => {
    loadCommonCommands()
  }, [])

  const loadCommonCommands = async () => {
    try {
      const response = await axios.get(`${API_URL}/adb/commands/common`)
      setCommonCommands(response.data.commands || [])
    } catch (error) {
      console.error('Error loading common commands:', error)
    }
  }

  const executeCommand = async () => {
    if (!selectedDevice || !adbCommand) {
      setCommandOutput('Please select a device and enter a command')
      return
    }
    try {
      const response = await axios.post(`${API_URL}/adb/execute`, null, {
        params: { udid: selectedDevice.udid, command: adbCommand }
      })
      setCommandOutput(response.data.output || 'No output')
    } catch (error) {
      setCommandOutput(`Error: ${error.message}`)
    }
  }

  const saveToFavorites = async () => {
    if (!adbCommand) return
    try {
      const response = await axios.post(`${API_URL}/adb/commands/save`, null, {
        params: { command: adbCommand }
      })
      if (response.data.success) {
        loadCommonCommands()
        alert(response.data.message)
      } else {
        alert(response.data.message)
      }
    } catch (error) {
      alert(`Error: ${error.message}`)
    }
  }

  const removeFromFavorites = async (command) => {
    try {
      const response = await axios.post(`${API_URL}/adb/commands/remove`, null, {
        params: { command }
      })
      if (response.data.success) {
        loadCommonCommands()
      }
    } catch (error) {
      console.error('Error removing command:', error)
    }
  }

  const closePerformance = () => {
    if (perfWsRef.current) perfWsRef.current.close()
    setPerfDevice(null)
    setIsMonitoring(false)
  }

  // Settings State
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState(null)

  const loadSettings = async () => {
    try {
      const response = await axios.get(`${API_URL}/settings`)
      setSettings(response.data)
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  const openSettings = () => {
    loadSettings()
    setShowSettings(true)
  }

  const toggleMonitoring = () => {
    if (isMonitoring) {
      if (perfWsRef.current) perfWsRef.current.close()
      setIsMonitoring(false)
    } else {
      if (!perfPackage) return alert("Please enter an app package name")

      setPerfData([])
      const ws = new WebSocket(`ws://localhost:8000/ws/performance/${perfDevice.udid}?package=${perfPackage}`)
      perfWsRef.current = ws

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        setPerfData(prev => [...prev.slice(-59), data]) // Keep last 60 points
      }

      ws.onclose = () => setIsMonitoring(false)
      setIsMonitoring(true)
    }
  }

  // Simple SVG Line Chart Component
  const LineChart = ({ data, dataKey, color, maxValue = 100, height = 100 }) => {
    if (!data.length) return null
    const width = 100
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1 || 1)) * width
      const val = parseFloat(d[dataKey]) || 0
      const y = height - (val / maxValue) * height
      return `${x},${y}`
    }).join(' ')

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          points={points}
        />
      </svg>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
      {/* Screenshot Preview Modal */}
      {screenshotPreview && (
        <div className="fixed inset-0 bg-black backdrop-blur-sm z-50 flex items-center justify-center p-8" onClick={() => setScreenshotPreview(null)}>
          <div className="bg-gray-800 rounded-xl p-6 max-w-4xl max-h-screen overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Screenshot Preview</h2>
              <button onClick={() => setScreenshotPreview(null)} className="text-gray-400 hover:text-white">
                <XCircle size={24} />
              </button>
            </div>
            <img src={screenshotPreview.url} alt="Screenshot" className="w-full h-auto rounded border border-gray-700" />
            <div className="mt-4 flex gap-2">
              <a
                href={screenshotPreview.url}
                download={screenshotPreview.filename}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 rounded text-center transition"
              >
                Download
              </a>
              <button
                onClick={() => setScreenshotPreview(null)}
                className="flex-1 py-2 bg-gray-600 hover:bg-gray-700 rounded transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-8" onClick={() => setShowSettings(false)}>
          <div className="bg-[#1a1f2e] rounded-xl p-6 max-w-4xl w-full max-h-screen overflow-auto border border-gray-700" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">⚙️ Settings</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">
                <XCircle size={24} />
              </button>
            </div>

            {settings && (
              <div className="space-y-6">
                {/* Paths */}
                <div>
                  <h3 className="text-lg font-semibold mb-3 text-blue-400">📁 Paths</h3>
                  <div className="bg-gray-900 rounded p-4 space-y-2 text-sm font-mono">
                    {Object.entries(settings.paths || {}).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-gray-400">{key}:</span>
                        <span className="text-gray-300">{value || '(not set)'}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Options */}
                <div>
                  <h3 className="text-lg font-semibold mb-3 text-green-400">🔧 Options</h3>
                  <div className="bg-gray-900 rounded p-4 space-y-2 text-sm">
                    {Object.entries(settings.options || {}).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-gray-400">{key}:</span>
                        <span className="text-gray-300">{typeof value === 'boolean' ? (value ? '✓' : '✗') : value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Appearance */}
                <div>
                  <h3 className="text-lg font-semibold mb-3 text-purple-400">🎨 Appearance</h3>
                  <div className="bg-gray-900 rounded p-4 space-y-2 text-sm">
                    {Object.entries(settings.appearance || {}).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-gray-400">{key}:</span>
                        <span className="text-gray-300">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 text-sm text-gray-500 text-center">
              Settings are currently read-only. Backend API configured.
            </div>
          </div>
        </div>
      )}

      {perfDevice && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8">
          <div className="bg-[#1f2937] rounded-xl w-full max-w-4xl p-6 border border-gray-700 shadow-2xl relative isolate">
            <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Activity className="text-purple-400" /> Performance: {perfDevice.model}
              </h2>
              <button onClick={closePerformance} className="text-gray-400 hover:text-white">
                <XCircle size={24} />
              </button>
            </div>

            <div className="flex gap-4 mb-6">
              <input
                type="text"
                placeholder="App Package (e.g. com.android.chrome)"
                className="flex-1 bg-gray-900 border border-gray-700 rounded px-4 py-2 text-white focus:border-purple-500 outline-none"
                value={perfPackage}
                onChange={e => setPerfPackage(e.target.value)}
              />
              <button
                onClick={toggleMonitoring}
                className={`px-6 py-2 rounded font-medium transition ${isMonitoring
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-purple-600 hover:bg-purple-700'
                  }`}
              >
                {isMonitoring ? 'Stop' : 'Start'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* CPU Chart */}
              <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                <h3 className="text-gray-400 mb-2 font-bold flex justify-between">
                  CPU Usage
                  <span className="text-purple-400">{perfData.length ? perfData[perfData.length - 1].cpu : 0}%</span>
                </h3>
                <div className="h-40 relative">
                  <LineChart data={perfData} dataKey="cpu" color="#a855f7" maxValue={100} height={100} />
                  {/* Grid lines */}
                  <div className="absolute inset-0 border-b border-gray-800 pointer-events-none" style={{ top: '50%' }}></div>
                </div>
              </div>

              {/* RAM Chart */}
              <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                <h3 className="text-gray-400 mb-2 font-bold flex justify-between">
                  RAM Usage
                  <span className="text-blue-400">{perfData.length ? perfData[perfData.length - 1].ram : 0} MB</span>
                </h3>
                <div className="h-40 relative">
                  {/* Dynamic Max Value for RAM based on max observed + buffer */}
                  <LineChart
                    data={perfData}
                    dataKey="ram"
                    color="#3b82f6"
                    maxValue={Math.max(500, ...perfData.map(d => parseFloat(d.ram) || 0)) * 1.2}
                    height={100}
                  />
                </div>
              </div>
            </div>

            {/* Stats Table */}
            <div className="mt-6 bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-800 text-gray-400">
                  <tr>
                    <th className="p-3">Time</th>
                    <th className="p-3">CPU</th>
                    <th className="p-3">RAM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {perfData.slice().reverse().slice(0, 5).map((d, i) => (
                    <tr key={i} className="hover:bg-gray-800/50">
                      <td className="p-3 font-mono text-gray-300">{new Date(d.timestamp * 1000).toLocaleTimeString()}</td>
                      <td className="p-3 font-mono text-purple-400">{d.cpu}%</td>
                      <td className="p-3 font-mono text-blue-400">{d.ram} MB</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      )}

      {inspectingDevice && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-8">
          <div className="bg-[#1f2937] rounded-xl w-full h-full max-w-7xl flex flex-col overflow-hidden border border-gray-700 relative isolate">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Smartphone className="text-blue-400" /> Inspector: {inspectingDevice.model}
              </h2>
              <div className="flex gap-4">
                <button
                  onClick={() => captureInspector(inspectingDevice)}
                  className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2 transition"
                >
                  <RefreshCw size={16} /> Refresh
                </button>
                <button
                  onClick={closeInspector}
                  className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded flex items-center gap-2 transition"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Screenshot Area */}
              <div className="flex-1 bg-black overflow-hidden flex items-center justify-center relative">
                {!inspectorData ? (
                  <div className="text-blue-400 animate-pulse flex flex-col items-center gap-4">
                    <RefreshCw className="animate-spin" size={48} />
                    <span className="text-xl">Capturing Screenshot & UI Dump...</span>
                  </div>
                ) : (
                  <div className="relative h-full flex items-center justify-center p-4">
                    <img
                      ref={imgRef}
                      src={`${API_URL}${inspectorData.screenshot}`}
                      alt="Device Screenshot"
                      className="max-h-full max-w-full w-auto h-auto object-contain shadow-lg"
                      draggable={false}
                      onLoad={(e) => {
                        const { clientWidth, clientHeight, naturalWidth, naturalHeight } = e.target
                        setImgScale({
                          x: clientWidth / naturalWidth,
                          y: clientHeight / naturalHeight
                        })
                      }}
                    />
                    {/* Overlay */}
                    <div className="absolute inset-0 pointer-events-none">
                      {inspectorData.elements.map((el, idx) => {
                        const [x1, y1, x2, y2] = el.bounds
                        const width = (x2 - x1) * imgScale.x
                        const height = (y2 - y1) * imgScale.y
                        const left = x1 * imgScale.x
                        const top = y1 * imgScale.y

                        return (
                          <div
                            key={idx}
                            className={`absolute border hover:bg-blue-500/20 cursor-pointer pointer-events-auto transition-colors ${selectedElement === el ? 'border-red-500 bg-red-500/20 z-10' : 'border-transparent hover:border-blue-400'
                              }`}
                            style={{ left, top, width, height }}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedElement(el)
                            }}
                          />
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Details Panel */}
              <div className="w-96 bg-gray-900 border-l border-gray-700 p-4 overflow-auto">
                <h3 className="font-bold text-lg mb-4 text-gray-300 border-b border-gray-700 pb-2">Element Details</h3>
                {selectedElement ? (
                  <div className="space-y-4">
                    {Object.entries(selectedElement).map(([key, value]) => (
                      <div key={key} className="break-words">
                        <span className="text-gray-500 text-sm uppercase font-bold block">{key}</span>
                        <span className="font-mono text-sm text-blue-300">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 italic">Select an element to view details.</p>
                )}

                {/* Temporary List for debugging/selection */}
                {inspectorData && (
                  <div className="mt-8 border-t border-gray-700 pt-4">
                    <h4 className="font-bold mb-2 text-gray-400">Elements ({inspectorData.elements.length})</h4>
                    <div className="space-y-1 text-xs font-mono h-64 overflow-auto">
                      {inspectorData.elements.map((el, idx) => (
                        <div
                          key={idx}
                          className="cursor-pointer hover:bg-gray-800 p-1 truncate"
                          onClick={() => setSelectedElement(el)}
                        >
                          {el['resource-id'] || el['class']}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <header className="mb-8 flex items-center justify-between border-b border-gray-700 pb-4">
        <h1 className="text-3xl font-bold text-blue-400 flex items-center gap-2">
          <Activity /> Robot Runner
        </h1>
        <div className="flex gap-4">
          <button
            onClick={toggleAppium}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition border ${appiumRunning
              ? 'bg-green-900/30 border-green-500 text-green-400 hover:bg-green-900/50'
              : 'bg-gray-800 border-gray-600 hover:bg-gray-700'
              }`}
          >
            <div className={`w-2 h-2 rounded-full ${appiumRunning ? 'bg-green-500' : 'bg-red-500'}`} />
            {appiumRunning ? 'Appium Running' : 'Start Appium'}
          </button>
          <button
            onClick={fetchDevices}
            className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 transition border border-gray-600"
          >
            <RefreshCw size={18} /> Refresh Devices
          </button>
          <button
            onClick={openSettings}
            className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 transition border border-gray-600"
          >
            ⚙️ Settings
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Devices Panel */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Smartphone className="text-green-400" /> Connected Devices
            </h2>
            {devices.length === 0 ? (
              <p className="text-gray-400 italic">No devices connected.</p>
            ) : (
              <ul className="space-y-3">
                {devices.map(device => (
                  <li
                    key={device.udid}
                    className={`p-4 rounded-lg transition border flex flex-col gap-2 ${selectedDevice?.udid === device.udid
                      ? 'bg-blue-900/30 border-blue-500'
                      : 'bg-gray-700/50 border-transparent hover:bg-gray-700'
                      }`}
                  >
                    <div
                      onClick={() => setSelectedDevice(device)}
                      className="cursor-pointer"
                    >
                      <div className="font-medium text-lg">{device.model}</div>
                      <div className="text-sm text-gray-400 flex justify-between">
                        <span>{device.udid}</span>
                        <span className="text-xs bg-gray-600 px-2 py-0.5 rounded">Android {device.release}</span>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleScrcpy(device)
                        }}
                        className={`flex-1 py-1.5 rounded text-sm font-medium transition border ${scrcpyStatus[device.udid]
                          ? 'bg-red-900/30 border-red-500 text-red-400 hover:bg-red-900/50'
                          : 'bg-gray-600 border-gray-500 hover:bg-gray-500'
                          }`}
                      >
                        {scrcpyStatus[device.udid] ? 'Stop Mirror' : 'Mirror'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          captureInspector(device)
                        }}
                        className="flex-1 py-1.5 rounded text-sm font-medium transition border bg-blue-600 border-blue-500 hover:bg-blue-500"
                      >
                        Inspect
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openPerformance(device)
                        }}
                        className="flex-1 py-1.5 rounded text-sm font-medium transition border bg-purple-600 border-purple-500 hover:bg-purple-500"
                      >
                        Perf
                      </button>
                    </div>

                    {/* Screenshot & Recording Row */}
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          takeScreenshot(device)
                        }}
                        className="flex-1 py-1.5 rounded text-xs font-medium transition border bg-cyan-600 border-cyan-500 hover:bg-cyan-500"
                      >
                        📷 Screenshot
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleRecording(device)
                        }}
                        className={`flex-1 py-1.5 rounded text-xs font-medium transition border ${recordingStatus[device.udid]
                          ? 'bg-red-600 border-red-500 animate-pulse'
                          : 'bg-orange-600 border-orange-500 hover:bg-orange-500'
                          }`}
                      >
                        {recordingStatus[device.udid] ? '⏹️ Stop Rec' : '⏺️ Record'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Test Selector Panel */}
          <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Test/Suite Selector</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => handleModeChange('suite')}
                  className={`px-4 py-2 rounded transition ${testMode === 'suite'
                    ? 'bg-blue-600'
                    : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                >
                  Suite (.txt)
                </button>
                <button
                  onClick={() => handleModeChange('test')}
                  className={`px-4 py-2 rounded transition ${testMode === 'test'
                    ? 'bg-blue-600'
                    : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                >
                  Test (.robot)
                </button>
              </div>
            </div>

            {/* Breadcrumb */}
            {currentPath && (
              <div className="text-sm text-gray-400 mb-2 font-mono">
                Path: {currentPath || '(root)'}
              </div>
            )}

            {/* File Browser */}
            <div className="bg-gray-900 rounded border border-gray-700 max-h-64 overflow-auto">
              {canGoUp && (
                <button
                  onClick={navigateUp}
                  className="w-full text-left px-4 py-2 hover:bg-gray-800 text-yellow-400 font-mono border-b border-gray-800"
                >
                  📁 .. (Go Up)
                </button>
              )}
              {fileItems.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500 italic">
                  No {testMode === 'suite' ? 'suites (.txt)' : 'tests (.robot)'} found
                </div>
              ) : (
                fileItems.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => navigateTo(item)}
                    className={`w-full text-left px-4 py-2 hover:bg-gray-800 font-mono text-sm border-b border-gray-800 transition ${selectedTestPath === item.path ? 'bg-blue-900/30 text-blue-300' : 'text-gray-300'
                      }`}
                  >
                    {item.type === 'directory' ? '📁 ' : '📄 '}{item.name}
                  </button>
                ))
              )}
            </div>

            {selectedTestPath && (
              <div className="mt-3 text-sm">
                <span className="text-gray-500">Selected: </span>
                <span className="text-green-400 font-mono">{selectedTestPath}</span>
              </div>
            )}
          </div>

          {/* ADB Wireless Connect Panel */}
          <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">ADB Wireless Connect</h2>

            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">IP Address</label>
                <input
                  type="text"
                  placeholder="192.168.1.100"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                  value={adbIp}
                  onChange={e => setAdbIp(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Port</label>
                <input
                  type="text"
                  placeholder="5555"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                  value={adbPort}
                  onChange={e => setAdbPort(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Pairing Port</label>
                <input
                  type="text"
                  placeholder="37321"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                  value={adbPairingPort}
                  onChange={e => setAdbPairingPort(e.target.value)}
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">Pairing Code</label>
              <input
                type="text"
                placeholder="123456"
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                value={adbCode}
                onChange={e => setAdbCode(e.target.value)}
              />
            </div>

            <div className="flex gap-2 mb-3">
              <button
                onClick={pairDevice}
                className="flex-1 py-2 rounded bg-yellow-600 hover:bg-yellow-700 transition font-medium"
              >
                Pair
              </button>
              <button
                onClick={connectDevice}
                className="flex-1 py-2 rounded bg-green-600 hover:bg-green-700 transition font-medium"
              >
                Connect
              </button>
              <button
                onClick={disconnectDevice}
                className="flex-1 py-2 rounded bg-red-600 hover:bg-red-700 transition font-medium"
                disabled={!selectedDevice || !selectedDevice.udid.includes(':')}
              >
                Disconnect
              </button>
            </div>

            {adbMessage && (
              <div className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 font-mono max-h-24 overflow-auto">
                {adbMessage}
              </div>
            )}
          </div>

          {/* ADB Commands Panel */}
          <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">ADB Commands</h2>

            <div className="mb-3">
              <label className="block text-sm text-gray-400 mb-1">Command</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g., shell getprop ro.build.version.release"
                  className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none font-mono"
                  value={adbCommand}
                  onChange={e => setAdbCommand(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && executeCommand()}
                />
                <button
                  onClick={executeCommand}
                  disabled={!selectedDevice}
                  className="px-6 py-2 rounded bg-green-600 hover:bg-green-700 transition font-medium disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  Run
                </button>
                <button
                  onClick={saveToFavorites}
                  disabled={!adbCommand}
                  className="px-4 py-2 rounded bg-yellow-600 hover:bg-yellow-700 transition font-medium disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  ⭐ Save
                </button>
              </div>
            </div>

            {/* Common Commands */}
            {commonCommands.length > 0 && (
              <div className="mb-3">
                <label className="block text-sm text-gray-400 mb-1">Favorites</label>
                <div className="bg-gray-900 border border-gray-700 rounded max-h-32 overflow-auto">
                  {commonCommands.map((cmd, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center px-3 py-2 hover:bg-gray-800 border-b border-gray-800 last:border-b-0"
                    >
                      <button
                        onClick={() => setAdbCommand(cmd)}
                        className="flex-1 text-left text-sm font-mono text-gray-300 hover:text-blue-400 transition"
                      >
                        {cmd}
                      </button>
                      <button
                        onClick={() => removeFromFavorites(cmd)}
                        className="ml-2 text-red-400 hover:text-red-300 text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Command Output */}
            {commandOutput && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Output</label>
                <div className="bg-black border border-gray-700 rounded px-3 py-2 text-xs text-green-400 font-mono max-h-48 overflow-auto whitespace-pre-wrap">
                  {commandOutput}
                </div>
              </div>
            )}
          </div>

          <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">Actions</h2>
            <div className="flex gap-4">
              <button
                onClick={runTest}
                disabled={isRunning || !selectedDevice}
                className={`flex-1 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition ${isRunning || !selectedDevice
                  ? 'bg-gray-600 cursor-not-allowed opacity-50'
                  : 'bg-green-600 hover:bg-green-700'
                  }`}
              >
                <Play size={20} /> Run Test
              </button>
              <button
                onClick={stopTest}
                disabled={!isRunning}
                className={`flex-1 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition ${!isRunning
                  ? 'bg-gray-600 cursor-not-allowed opacity-50'
                  : 'bg-red-600 hover:bg-red-700'
                  }`}
              >
                <Square size={20} /> Stop
              </button>
            </div>
          </div>
        </div>

        {/* Logs Panel */}
        <div className="lg:col-span-2 bg-black rounded-xl shadow-lg border border-gray-700 flex flex-col h-[600px]">
          <div className="p-4 border-b border-gray-800 flex items-center gap-2 bg-gray-900 rounded-t-xl">
            <Terminal size={18} className="text-gray-400" />
            <span className="font-mono text-sm text-gray-300">Console Output</span>
          </div>
          <div className="flex-1 overflow-auto p-4 font-mono text-sm space-y-1">
            {logs.length === 0 ? (
              <div className="text-gray-600 italic">Ready to run tests...</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="break-words text-gray-300 border-b border-gray-900/50 pb-0.5">
                  {log}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
