export type previewEnum = "noPreview" | "secureCodePreview";
export type userDataType = {id: string, student: {id: string, name: string, grade: number, class: number}, info: any};

export function createQRCode(canvasId: string, data: string, backgroundColor: string) { // data is the string value of the qr code
  let QRCode = require('weapp-qrcode')
  let qrcode = new QRCode(canvasId, {
    usingIn: "",
    text: "",
    width: 184,
    height: 184,
    colorDark: "#000000",
    colorLight: `#${backgroundColor}`, // sync this with the interface color
    correctLevel: QRCode.CorrectLevel.H,
  });
  qrcode.makeCode(data)
}