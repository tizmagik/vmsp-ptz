interface StatusIndicatorProps {
  status: 'loading' | 'success' | 'error';
  message: string;
}

export function StatusIndicator({ status, message }: StatusIndicatorProps) {
  return (
    <div className={`status ${status}`}>
      {message}
    </div>
  );
}
