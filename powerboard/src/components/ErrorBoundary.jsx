import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" style={{
          padding: '20px',
          margin: '20px',
          border: '2px solid #ff0000',
          backgroundColor: '#ffe0e0',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
          <p>An error occurred while rendering this component.</p>
          {this.state.error && (
            <details style={{ marginTop: '10px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Error details</summary>
              <pre style={{
                marginTop: '10px',
                padding: '10px',
                backgroundColor: '#fff',
                border: '1px solid #ccc',
                overflow: 'auto',
                fontSize: '12px'
              }}>
                {this.state.error.toString()}
                {this.state.error.stack && `\n\n${this.state.error.stack}`}
              </pre>
            </details>
          )}
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null })
              window.location.reload()
            }}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              backgroundColor: '#0078d4',
              color: 'white',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
