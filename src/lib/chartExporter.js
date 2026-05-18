import html2canvas from 'html2canvas'

export async function exportChartAsPng(elementRef, filename = 'chart.png') {
  try {
    const canvas = await html2canvas(elementRef, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
    })
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
  } catch (err) {
    console.error('Chart export failed:', err)
  }
}
