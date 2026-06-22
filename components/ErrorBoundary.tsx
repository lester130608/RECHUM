import React, { ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// ErrorBoundary para capturar errores de renderizado en componentes hijos
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Puedes loguear el error a un servicio externo aquí si lo deseas
    if (process.env.NODE_ENV !== 'production') {
      console.error('ErrorBoundary atrapó un error:', error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{color: 'red', padding: '2rem', border: '2px solid #f59e42', borderRadius: 8, background: '#fffbe9', maxWidth: 600, margin: '2rem auto'}}>
          <h2>Ocurrió un error inesperado</h2>
          <pre style={{whiteSpace: 'pre-wrap'}}>{this.state.error?.message || String(this.state.error)}</pre>
          <div style={{marginTop: 16}}>Por favor, recarga la página o contacta a soporte si el problema persiste.</div>
        </div>
      );
    }
    return this.props.children;
  }
}
