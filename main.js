"use strict";

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const port = 3001;

// Db connection
const mongoose = require('mongoose');
const mongoUri = 'mongodb+srv://name:pass@host/?retryWrites=true&w=majority&appName=nico-db';
mongoose.connect(mongoUri)
  .then(() => console.log("Db connect"))
  .catch(err => console.error('Error al conectar a MongoDB Atlas', err));


// Simple schemas
const visitaSchema = new mongoose.Schema({
  fecha: { type: Date, default: Date.now },
  contador: { type: Number, default: 1 }
});

const clickSchema = new mongoose.Schema({
  seccion: String,
  fecha: { type: Date, default: Date.now },
  contador: { type: Number, default: 1 }
});

const Visita = mongoose.model('Visita', visitaSchema);
const Click = mongoose.model('Click', clickSchema);

app.use(bodyParser.json());
app.use(cors());

// Unified tracking endpoint
app.post('/api/track', async (req, res) => {
  const { type, url, sectionId, timestamp } = req.body;
  console.log('Data received:', req.body);  // Log received data
  const hoy = new Date(new Date(timestamp).setHours(0, 0, 0, 0));

  try {
    if (type === 'visit') {
      let visita = await Visita.findOne({ fecha: hoy });
      if (visita) {
        visita.contador += 1;
      } else {
        visita = new Visita({ fecha: hoy, contador: 1 });
      }
      await visita.save();
      console.log('Visit tracked:', visita);  // Log visit data
    } else if (type === 'click') {
      let click = await Click.findOne({ seccion: sectionId, fecha: hoy });
      if (click) {
        click.contador += 1;
      } else {
        click = new Click({ seccion: sectionId, fecha: hoy, contador: 1 });
      }
      await click.save();
      console.log('Click tracked:', click);  // Log click data
    }
    res.json({ message: 'Data tracked successfully' });
  } catch (error) {
    console.error('Error tracking data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/contador/metricas', async (req, res) => {
  try {
    const visitas = await Visita.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$fecha" } },
          total: { $sum: '$contador' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    const clicks = await Click.aggregate([
      {
        $group: {
          _id: { seccion: '$seccion', fecha: { $dateToString: { format: "%Y-%m-%d", date: "$fecha" } } },
          total: { $sum: '$contador' }
        }
      },
      {
        $sort: { '_id.fecha': 1 }
      },
      {
        $group: {
          _id: '$_id.seccion',
          data: { $push: { fecha: '$_id.fecha', contador: '$total' } }
        }
      }
    ]);

    res.json({
      visitas: visitas.map(v => ({ fecha: v._id, contador: v.total })),
      clicks: clicks.map(c => ({ seccion: c._id, data: c.data }))
    });
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Server, port
app.listen(port, () => {
  console.log(`Servidor de la API escuchando en http://localhost:${port}`);
});
