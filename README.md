<div align="center">
  <img src="assets/logo.png" alt="CPcheckES" width="640">
  <p>QA de códigos postales de España en OpenStreetMap.</p>
  <p><a href="https://atarom.github.io/CPcheckES/"><strong>▶ Abrir CPcheckES</strong></a></p>
</div>

---

**CPcheckES** es una herramienta web para detectar y revisar posibles errores en los valores `addr:postcode` de [OpenStreetMap](https://www.openstreetmap.org/) en España. Contrasta los códigos encontrados en OSM con un CSV local de códigos postales válidos y permite inspeccionar los objetos directamente sobre el mapa.

### Funcionalidades

- **Consultar** un código postal, visualizar sus objetos OSM y examinar su información.
- **Listar todos** los códigos encontrados en OSM, contar los elementos asociados y señalar los valores no válidos.
- **Elegir motor** de consulta entre Overpass y Postpass, con consultas adaptadas automáticamente al servidor seleccionado.
- **Seleccionar con el lazo** y enviar los objetos a JOSM para que los descargue por su identificador OSM; abrir consultas en Overpass Turbo.

### Tecnologías y datos

[OpenLayers](https://openlayers.org/) para el mapa · [OpenStreetMap](https://www.openstreetmap.org/) para los datos · [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) y [Postpass](https://postpass.geofabrik.de/) para las consultas · [CartoCiudad](https://www.cartociudad.es/) como referencia cartográfica.

Los datos de OpenStreetMap están sujetos a la licencia [ODbL](https://www.openstreetmap.org/copyright). La lista de referencia de códigos postales está en `data/cp-validos.csv`.
