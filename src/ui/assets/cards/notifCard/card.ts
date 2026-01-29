import { createBevelPath, drawRandomRects, drawTextBlock } from '@/utils'
import Canvas from '@napi-rs/canvas'

const themes = {
    blue: {
        background: ['#6cd0ff', '#1a99cf'],
        border: '#1a99cf',
        rects: ['#92CEE5', '#6cd0ff']
    },
    purple: {
        background: ['#876cff', '#591acf'],
        border: '#591acf',
        rects: ['#af92e5', '#b16cff']
    },
    green: {
        background: ['#60db5c', '#52d86f'],
        border: '#52d86f',
        rects: ['#92e599', '#6cff6c']
    },
    red: {
        background: ['#ff6c6c', '#cf1a1a'],
        border: '#cf1a1a',
        rects: ['#e59292', '#ff6c6c']
    },
    orange: {
        background: ['#ffb36c', '#cf871a'],
        border: '#cf7b1a',
        rects: ['#e5c892', '#ffbf6c']
    },
    pink: {
        background: ['#ff6cf8', '#cf1ab7'],
        border: '#cf1ab7',
        rects: ['#e592da', '#ff6cf3']
    }
}

interface CreateNotifCard {
    text: string;
    fontSize?: number;
    theme?: keyof typeof themes;
}

export const createNotifCard = async (options: CreateNotifCard) => {
    const {
        text,
        fontSize = 26,
        theme = 'blue'
    } = options;

    const canvas = Canvas.createCanvas(512, 170);
    const ctx = canvas.getContext('2d');

    const colors = themes[theme];

    const margin = 15;
    const bevelPathData = {
        topLeft: 24,
        topRight: 0,
        bottomRight: 24,
        bottomLeft: 0
    }

    const { width, height } = canvas

    // Form
    const bevelPath = createBevelPath({
        width,
        height,
        margin,
        ...bevelPathData,
    });

    ctx.fillStyle = colors.background[1]
    ctx.fill(bevelPath)

    // Inner Shadow
    ctx.save()
    ctx.clip(bevelPath)
    ctx.shadowColor = colors.background[0]
    ctx.shadowBlur = 40
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    ctx.fillStyle = '#00000000'
    ctx.fillRect(margin + 20, margin + 20, width - 2 * margin - 40, height - 2 * margin - 40)
    ctx.restore()

    // Border
    ctx.strokeStyle = '#00000000'
    ctx.lineWidth = 6
    ctx.stroke(bevelPath)

    // Border offset
    const offset = 8
    const bevelPathWithOffset = createBevelPath({
        width,
        height,
        margin: margin - offset,
        topLeft: bevelPathData.topLeft + 5,
        topRight: 0,
        bottomRight: bevelPathData.bottomRight + 5,
        bottomLeft: 0,
    });

    ctx.strokeStyle = colors.border
    ctx.lineWidth = 4
    ctx.stroke(bevelPathWithOffset)

    drawTextBlock(ctx, text.toUpperCase(), {
        x: width / 2,
        y: height / 2,
        maxWidth: (width - margin * 2) - 10,
        font: 'Quantico',
        fontSize,
        align: 'center',
        baseline: 'middle',
        centerVertically: true,
        shadow: {
            color: '#FFF',
            blur: 6
        }
    });

    drawRandomRects(ctx, {
        amount: 12,
        colors: colors.rects,
        canvasWidth: width,
        canvasHeight: height,
        height: 10,
        width: 15,
        maxHeight: 15,
        maxWidth: 20,
        margin,
    });

    return await canvas.encode('png');
}
