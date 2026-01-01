import { useState, useEffect } from 'react'

function App() {
  const [count, setCount] = useState(0)
  const [version, setVersion] = useState<string>('loading...')

  useEffect(() => {
    // @ts-ignore
    window.ipcRenderer.invoke('get-version').then(setVersion).catch((err) => setVersion('Error: ' + err))
  }, [])

  return (
    <div className="container">
      <h1>Gemini Desktop</h1>
      <p>Core Version: {version}</p>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/renderer/App.tsx</code> and save to test HMR
        </p>
      </div>
    </div>
  )
}

export default App
