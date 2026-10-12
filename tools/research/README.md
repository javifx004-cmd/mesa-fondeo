# Investigación de estrategias EURUSD (2010–2025)

Scripts para reproducir la búsqueda de ventaja estadística sobre datos M1 de HistData.

```bash
python3 tools/research/prep.py <carpeta_csv_M1> <carpeta_salida>   # crea m1_all.pkl y h1_all.pkl
python3 tools/research/hours.py  <carpeta_salida>   # rentabilidad media por hora y año
python3 tools/research/season.py <carpeta_salida>   # ventanas de venta estacionales (train 2010-17 / test 2018-25)
python3 tools/research/cond.py   <carpeta_salida>   # condicionantes sobre la ventana 13-16
python3 tools/research/trend.py  <carpeta_salida>   # seguimiento de tendencia H4/D1
```

Coste asumido: 1 pip por operación (0.3 spread + 0.7 comisión). Horas en servidor GMT+2/+3.
