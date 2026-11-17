// Drawing-only adaptation of Brad Arnett's Sketch. Original sources are archived alongside this file.
const drawingCanvas = document.createElement('canvas')
drawingCanvas.width = window.innerWidth
drawingCanvas.height = window.innerHeight

drawingCanvas.style.position = 'fixed'
drawingCanvas.style.left = 0
drawingCanvas.style.top = 0
drawingCanvas.style.zIndex = 1

document.body.appendChild(drawingCanvas)

var drawingCtx = drawingCanvas.getContext('2d')

let isDrawing,
		newlyUp = false,
		lastPoint

let pencilPathDefaults = {
	minThickness: .2,
	maxThickness: 2,
}

let pencilPathCurrent = {
	thickness: .2
}

let pencilPathTarget = {
	thickness: .2
}

document.addEventListener('touchstart', handleMouseDown)
document.addEventListener('mousedown', handleMouseDown)

function handleMouseDown(e) {
	if (e.target.localName !== 'canvas') return
  isDrawing = true

	pencilPathTarget.thickness = pencilPathDefaults.maxThickness
	
	let xPos = (e.touches ? e.touches[0].clientX : e.clientX),
			yPos = (e.touches ? e.touches[0].clientY : e.clientY)

	let currentPoint = { x: xPos, y: yPos }

	drawingCtx.beginPath()
	drawingCtx.fillStyle = '#100c08';
	drawingCtx.globalAlpha = .9
	drawingCtx.arc(
		currentPoint.x + 5, currentPoint.y + 5, pencilPathDefaults.minThickness,
		false, Math.PI * 2, false)
	drawingCtx.fill()

	lastPoint = currentPoint
}

document.addEventListener('touchend', handleMouseUp)
document.addEventListener('mouseup', handleMouseUp)

function handleMouseUp() {
	newlyUp = true
  isDrawing = false
	pencilPathTarget.thickness = pencilPathDefaults.minThickness
	
	setTimeout(fullyUp, 50)
}

function fullyUp() {
	newlyUp = false
}


function animateThickness() {
  pencilPathCurrent.thickness += (pencilPathTarget.thickness - pencilPathCurrent.thickness) * .2
  requestAnimationFrame(animateThickness)
}
animateThickness()
document.addEventListener('mousemove',mouseMove)
document.addEventListener('touchmove',mouseMove,{passive:false})
function clearCanvas() {
 drawingCtx.clearRect(0,0,drawingCanvas.width,drawingCanvas.height)
}
window.addEventListener('resize',()=>{
 const saved=document.createElement('canvas')
 saved.width=drawingCanvas.width; saved.height=drawingCanvas.height
 saved.getContext('2d').drawImage(drawingCanvas,0,0)
 drawingCanvas.width=innerWidth; drawingCanvas.height=innerHeight
 drawingCtx.drawImage(saved,0,0)
})
function mouseMove (e) {
	let xPos = (e.touches ? e.touches[0].clientX : e.clientX),
			yPos = (e.touches ? e.touches[0].clientY : e.clientY)
	
	if (!lastPoint) lastPoint = {x:xPos,y:yPos}
	const currentPoint = {x:xPos,y:yPos}
	const angle = angleBetween(lastPoint,currentPoint)
	if (isDrawing || newlyUp) {
		let dist = distanceBetween(lastPoint, currentPoint)

		for (var i = 0; i < dist; i += .3) {
			const x = lastPoint.x + (Math.sin(angle) * i)
			const y = lastPoint.y + (Math.cos(angle) * i)
			
			drawingCtx.beginPath()
			drawingCtx.globalAlpha = getRandomInt(.15, .25)
			drawingCtx.arc(
				x + 5, y + 5, pencilPathCurrent.thickness, 
				false, Math.PI * 2, false)
			drawingCtx.fill()
		}
	}
	
	lastPoint = currentPoint
}

// Refresh
let refreshBtn = document.querySelector('.pencil__refresh')
refreshBtn.addEventListener('click', handleRefresh)

function handleRefresh(e) {
	e.preventDefault()
	
	clearCanvas()	
}

// Save
let submitBtn = document.querySelector('.pencil__submit')
submitBtn.addEventListener('click', handleSubmit)

function handleSubmit(e) {
	e.preventDefault()
	
	savePNG()
}

function savePNG() {
	const freshCanvas = document.createElement('canvas')
	freshCanvas.width = drawingCanvas.width
	freshCanvas.height = drawingCanvas.height

	let freshCtx = freshCanvas.getContext('2d')
	
	freshCtx.fillStyle = "#f7f4f0"
	freshCtx.fillRect(0, 0, freshCanvas.width, freshCanvas.height)
	freshCtx.drawImage(drawingCanvas, 0, 0)
	
	let imageDataURL = freshCanvas.toDataURL()
	let image = new Image()
	
	image.src = imageDataURL
	
	var w = window.open("")
  w.document.write(image.outerHTML)
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function distanceBetween(point1, point2) {
  return Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2))
}

function distanceBetweenSingle(point1, point2) {
  return point1 - point2
}

function angleBetween(point1, point2) {
  return Math.atan2( point2.x - point1.x, point2.y - point1.y )
}

function direction(point1, point2) {
  return Math.atan2( point1, point2)
}