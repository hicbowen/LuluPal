import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

const windowType = new URLSearchParams(window.location.search).get('window') ?? 'settings'
document.documentElement.dataset.window = windowType

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
