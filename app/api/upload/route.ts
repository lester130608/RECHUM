import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const form = new formidable.IncomingForm();
  form.uploadDir = path.join(process.cwd(), 'uploads');
  form.keepExtensions = true;

  form.parse(req, (err, fields, files) => {
    if (err) {
      res.status(500).json({ error: 'Error al procesar el archivo' });
      return;
    }

    const file = files.file as formidable.File;
    const filePath = file.filepath;
    const fileContent = fs.readFileSync(filePath, 'utf8');

    // Aquí puedes procesar el contenido del archivo y guardarlo en tu base de datos
    // Por ejemplo, si estás usando MongoDB:
    // const db = await connectToDatabase();
    // await db.collection('documents').insertOne({ content: fileContent });

    res.status(200).json({ message: 'Archivo subido y procesado con éxito' });

    // Eliminar el archivo temporal
    fs.unlinkSync(filePath);
  });
}