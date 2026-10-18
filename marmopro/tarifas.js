'use strict';

// Tarifa DE EJEMPLO para empezar: cada empresa carga la suya en el presupuesto con «Cambiar tarifas»
// (mismo formato CSV) o añade sus colores en «Colores y grupos». Los precios de aquí son orientativos.
const TARIFAS_CSV = `Marca;Grupo;Material;Espesor;€ m/l;€ m2;Zócalo € m/l
Cuarzo (ejemplo);Grupo 1;BLANCO NIEVE;20 mm;180,0;260,0;
Cuarzo (ejemplo);Grupo 1;GRIS PERLA;20 mm;180,0;260,0;
Cuarzo (ejemplo);Grupo 1;NEGRO MATE;20 mm;180,0;260,0;
Cuarzo (ejemplo);Grupo 1;BEIGE ARENA;20 mm;180,0;260,0;
Cuarzo (ejemplo);Grupo 2;BLANCO VETEADO;20 mm;210,0;300,0;
Cuarzo (ejemplo);Grupo 2;GRIS CEMENTO;20 mm;210,0;300,0;
Cuarzo (ejemplo);Grupo 2;TAUPE;20 mm;210,0;300,0;
Cuarzo (ejemplo);Grupo 3;CALACATTA;20 mm;240,0;345,0;
Cuarzo (ejemplo);Grupo 3;CARRARA;20 mm;240,0;345,0;
Cuarzo (ejemplo);Grupo 3;MARQUINA;20 mm;240,0;345,0;
Cuarzo (ejemplo);Grupo 4;CALACATTA ORO;20 mm;290,0;415,0;
Cuarzo (ejemplo);Grupo 4;STATUARIO;20 mm;290,0;415,0;
Porcelánico (ejemplo);Grupo 1;CEMENTO GRIS;12 mm;170,0;245,0;
Porcelánico (ejemplo);Grupo 1;BLANCO MATE;12 mm;170,0;245,0;
Porcelánico (ejemplo);Grupo 1;NEGRO;12 mm;170,0;245,0;
Porcelánico (ejemplo);Grupo 2;MÁRMOL BLANCO;12 mm;220,0;315,0;
Porcelánico (ejemplo);Grupo 2;PIEDRA NATURAL;12 mm;220,0;315,0;
Porcelánico (ejemplo);Grupo 2;MADERA ROBLE;12 mm;220,0;315,0;
Porcelánico (ejemplo);Grupo 3;ÓNIX;12 mm;280,0;400,0;
Porcelánico (ejemplo);Grupo 3;CALACATTA BOOKMATCH;12 mm;280,0;400,0;
Granito (ejemplo);Grupo A;BLANCO CRISTAL;20 mm;100,0;140,0;22,0
Granito (ejemplo);Grupo A;ROSA PORRIÑO;20 mm;100,0;140,0;22,0
Granito (ejemplo);Grupo B;GRIS QUARZ;20 mm;130,0;185,0;30,0
Granito (ejemplo);Grupo B;NEGRO SUDÁFRICA;20 mm;130,0;185,0;30,0
Granito (ejemplo);Grupo C;NEGRO ZIMBABUE;20 mm;175,0;250,0;42,0
Granito (ejemplo);Grupo C;VERDE UBATUBA;20 mm;175,0;250,0;42,0

Categoría;Concepto;€
Cantos;Canto recto;9
Cantos;Canto doble recto con junta;30
Cantos;Canto romo;25
Cantos;Canto ingletado 6 cm;60
Huecos y fregaderos;Hueco sobre encimera;20
Huecos y fregaderos;Hueco bajo encimera;75
Huecos y fregaderos;Hueco plano inclinado;300
Huecos y fregaderos;Hueco de grifo;12
Huecos y fregaderos;Cajas;20
Colocación;Colocación aplacado;60
Colocación;Colocación de bancada;120`;
