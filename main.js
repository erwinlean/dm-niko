"use strict";

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

const app = express();
const port = 3001;

const mongoUri = "mongodb+srv://name:password@host/?retryWrites=true&w=majority&appName=dbname";
mongoose.connect(mongoUri)
  .then(() => console.log("Db connect"))
  .catch(err => console.error("Error al conectar a MongoDB Atlas", err));

const visitaSchema = new mongoose.Schema({
  fecha: { type: Date, default: Date.now },
  contador: { type: Number, default: 0 },
  duracion: { type: Number, default: 0 }
});

const clickSchema = new mongoose.Schema({
  seccion: String,
  fecha: { type: Date, default: Date.now },
  contador: { type: Number, default: 0 }
});

const Visita = mongoose.model("Visita", visitaSchema);
const Click = mongoose.model("Click", clickSchema);

app.use(bodyParser.json());
app.use(cors());

app.post("/api/track", async (req, res) => {
  const { type, url, sectionId, timestamp, duracion } = req.body;
  const hoy = new Date(new Date(timestamp).setHours(0, 0, 0, 0));

  try {
    if (type === "visit") {
      let visita = await Visita.findOne({ fecha: hoy });
      if (visita) {
        visita.contador += 1;
        if (duracion) {
          visita.duracion += duracion;
        }
      } else {
        visita = new Visita({ fecha: hoy, contador: 1, duracion: duracion || 0 });
      }
      await visita.save();
      
    } else if (type === "click") {
      let click = await Click.findOne({ seccion: sectionId, fecha: hoy });
      if (click) {
        click.contador += 1;
      } else {
        click = new Click({ seccion: sectionId, fecha: hoy, contador: 1 });
      }
      await click.save();
    }
    res.json({ message: "Success" });
  } catch (error) {
    console.error("Error tracking data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/contador/metricas", async (req, res) => {
  try {
    const visitas = await Visita.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$fecha" } },
          total: { $sum: "$contador" },
          duracionTotal: { $sum: "$duracion" }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    const clicks = await Click.aggregate([
      {
        $group: {
          _id: { seccion: "$seccion", fecha: { $dateToString: { format: "%Y-%m-%d", date: "$fecha" } } },
          total: { $sum: "$contador" }
        }
      },
      {
        $sort: { "_id.fecha": 1 }
      },
      {
        $group: {
          _id: "$_id.seccion",
          data: { $push: { fecha: "$_id.fecha", contador: "$total" } }
        }
      }
    ]);

    const visitLabels = visitas.map(v => v._id);
    const visitData = visitas.map(v => v.total);
    const durationData = visitas.map(v => v.duracionTotal / v.total);

    const clickLabels = visitLabels;
    const clickData = visitLabels.map(date => {
      const totalClicks = clicks.reduce((acc, clickGroup) => {
        const click = clickGroup.data.find(c => c.fecha === date);
        return acc + (click ? click.contador : 0);
      }, 0);
      const totalVisits = visitData[visitLabels.indexOf(date)];
      return totalVisits ? totalClicks / totalVisits : 0;
    });

    const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 1250, height: 750, backgroundColour: "black" });

    const combinedChartConfig = {
      type: "bar",
      data: {
        labels: visitLabels,
        datasets: [
          {
            label: "Visitas Totales",
            data: visitData,
            backgroundColor: "rgb(17 24 39 / var(--tw-bg-opacity))",
            borderColor: "white",
            borderWidth: 1
          },
          {
            label: "Duración promedio de Visitas",
            data: durationData,
            backgroundColor: "rgb(253 224 71 / var(--tw-text-opacity))",
            borderColor: "white",
            borderWidth: 1
          },
          {
            label: "Clicks Promedio por Visita",
            data: clickData,
            backgroundColor: "rgb(31 41 55 / var(--tw-bg-opacity))", 
            borderColor: "white",
            borderWidth: 1
          }
        ]
      },
      options: {
        scales: {
          x: {
            type: "category",
            grid: {
              color: "rgba(255, 255, 255, 0.2)",
            },
            ticks: {
              color: "white"
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: "rgba(255, 255, 255, 0.2)",
            },
            ticks: {
              color: "white"
            }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: "white"
            }
          },
          title: {
            display: true,
            text: "Métricas de Visitas y Clicks",
            color: "white",
            font: {
              size: 20
            }
          }
        }
      }
    };

    const combinedChart = await chartJSNodeCanvas.renderToBuffer(combinedChartConfig);

    res.set("Content-Type", "image/png");
    res.send(combinedChart);
  } catch (error) {
    console.error("Error fetching metrics:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.delete("/api/delete-all", async (req, res) => {
  try {
    await Visita.deleteMany({});
    await Click.deleteMany({});
    res.json({ message: "All data deleted successfully" });
  } catch (error) {
    console.error("Error deleting data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(port, () => {
  console.log(`Port: ${port}`);
});