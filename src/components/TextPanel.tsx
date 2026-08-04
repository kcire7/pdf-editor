interface TextPanelProps {
  text: string
  onChange: (text: string) => void
  onExport: () => void
}

export default function TextPanel({ text, onChange, onExport }: TextPanelProps) {
  return (
    <div className="text-panel">
      <div className="text-panel-header">
        <h2>Texto extraído</h2>
        <button onClick={onExport} disabled={!text}>
          Exportar .txt
        </button>
      </div>
      <textarea
        value={text}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Usa 'Extraer texto' para traer el contenido del PDF aquí y editarlo..."
      />
    </div>
  )
}
