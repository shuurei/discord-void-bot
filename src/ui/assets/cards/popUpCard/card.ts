import Canvas from '@napi-rs/canvas'

export const popUpCard = async () => {
    const canvas = Canvas.createCanvas(512, 512);
    const ctx = canvas.getContext('2d');

    const { height, width } = canvas;

    // ---------- Fond ----------
    ctx.fillStyle = '#88ff0066'
    ctx.fillRect(0, 0, width, height)

    // ---------- Inner shadow bleu ----------
    ctx.save()

    ctx.beginPath()
    ctx.rect(0, 0, width, height)
    ctx.clip()

    ctx.globalCompositeOperation = 'source-over'
    ctx.shadowColor = '#e64b4b' 
    ctx.shadowBlur = 20
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0

    // On dessine un rect plus petit pour forcer l'ombre vers l'intérieur
    ctx.fillStyle = '#00000000'
    ctx.fillRect(20, 20, width - 40, height - 40)

    ctx.restore()

    // ---------- Border ----------
    ctx.strokeStyle = '#6DAFED66'
    ctx.lineWidth = 8
    ctx.strokeRect(1, 1, width - 2, height - 2)

    return await canvas.encode('png')
}
