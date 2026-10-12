'use strict';

// Tarifas por defecto (tarifas_carbonell_2025.csv). Desde la app se pueden cargar otras
// con el mismo formato: una tabla de materiales y, tras una línea vacía, la de conceptos.
const TARIFAS_CSV = `Marca;Grupo;Material;Espesor;€ m/l;€ m2;Zócalo € m/l
Ceratop;Grupo 1;WHITE SNOW NATURAL;12 mm mate;140,0;200,0;
Ceratop;Grupo 1;BORGHINI NATURAL;12 mm mate;140,0;200,0;
Ceratop;Grupo 1;DOLOMITI NATURAL;12 mm mate;140,0;200,0;
Ceratop;Grupo 1;CEMENT NATURAL;12 mm mate;140,0;200,0;
Ceratop;Grupo 1;NERO SAINT LAURENT NATURAL;12 mm mate;140,0;200,0;
Ceratop;Grupo 1;DUNA NATURAL;12 mm mate;140,0;200,0;
Ceratop;Grupo 1;VENATINO GOLD NATURAL;12 mm mate;140,0;200,0;
Techlam;Grupo 1;THAR;12 mm mate;145,0;209,0;
Techlam;Grupo 1;TAMBORA;12 mm mate;145,0;209,0;
Techlam;Grupo 1;THUNDRA;12 mm mate;145,0;209,0;
Techlam;Grupo 2;BASIC ICE;12 mm mate;172,0;247,0;
Techlam;Grupo 2;BASIC BLACK;12 mm mate;172,0;247,0;
Techlam;Grupo 3;CRYSTALLO;12 mm mate;180,0;255,0;
Techlam;Grupo 3;MARVEL GOLD;12 mm mate;180,0;255,0;
Techlam;Grupo 3;KALOS BIANCO;12 mm mate;180,0;255,0;
Techlam;Grupo 3;FEROX;12 mm mate;180,0;255,0;
Techlam;Grupo 3;QUARTZITE;12 mm mate;180,0;255,0;
Techlam;Grupo 3;CONCERTO;12 mm mate;180,0;255,0;
Techlam;Grupo 3;LEGNO;12 mm mate;180,0;255,0;
Techlam;Grupo 3;FIOR DI BOSCO;12 mm mate;180,0;255,0;
Techlam;Grupo 3;ARDESIA NERO;12 mm mate;180,0;255,0;
Techlam;Grupo 3;SUPERGREY;12 mm mate;180,0;255,0;
Techlam;Grupo 3;NOIR SAINT LAURENT;12 mm mate;180,0;255,0;
Techlam;Grupo 3;BIANCO LASA;12 mm mate;180,0;255,0;
Techlam;Grupo 4;KALEDONIA;12 mm mate;200,0;286,0;
Techlam;Grupo 4;BLACKFALLS;12 mm mate;200,0;286,0;
Ascale;Grupo 0;CROMA BLACK;12 mm mate;138,0;198,0;
Ascale;Grupo 0;CROMA IVORY;12 mm mate;138,0;198,0;
Ascale;Grupo 0;CROMA SILVER;12 mm mate;138,0;198,0;
Ascale;Grupo 0;CROMA WHITE;12 mm mate;138,0;198,0;
Ascale;Grupo 1;ALLURE BLACK;12 mm mate;161,0;230,0;
Ascale;Grupo 1;BOREAL SAND;12 mm mate;161,0;230,0;
Ascale;Grupo 1;GRASSI WHITE;12 mm mate;161,0;230,0;
Ascale;Grupo 1;LASA WHITE;12 mm mate;161,0;230,0;
Ascale;Grupo 1;PALOMASTONE LINEN;12 mm mate;161,0;230,0;
Ascale;Grupo 1;ALPI WHITE;12 mm mate;161,0;230,0;
Ascale;Grupo 1;ARIZONA SAND;12 mm mate;161,0;230,0;
Ascale;Grupo 1;COSMOPOLITA GRAY;12 mm mate;161,0;230,0;
Ascale;Grupo 1;COSMOPOLITA IVORY;12 mm mate;161,0;230,0;
Ascale;Grupo 1;COSMOPOLITA SILVER;12 mm mate;161,0;230,0;
Ascale;Grupo 1;ARMANI SILVER;12 mm mate;161,0;230,0;
Ascale;Grupo 2;ALTO STATUARIO;12 mm mate;200,0;286,0;
Ascale;Grupo 2;AMAZONITE SEAGREEN;12 mm mate;200,0;286,0;
Ascale;Grupo 2;ARABESCATTO WHITE;12 mm mate;200,0;286,0;
Ascale;Grupo 2;BAHIA SILVER;12 mm mate;200,0;286,0;
Ascale;Grupo 2;BELVEDERE BLACK;12 mm mate;200,0;286,0;
Ascale;Grupo 2;BOREAL UMBER;12 mm mate;200,0;286,0;
Ascale;Grupo 2;BORGOGNA SILVER;12 mm mate;200,0;286,0;
Ascale;Grupo 2;CARDOSO GRAY;12 mm mate;200,0;286,0;
Ascale;Grupo 2;CROTONE PULPIS;12 mm mate;200,0;286,0;
Ascale;Grupo 2;DUCAL GOLD;12 mm mate;200,0;286,0;
Ascale;Grupo 2;ETNA GOLD;12 mm mate;200,0;286,0;
Ascale;Grupo 2;IMPERIA BLACK;12 mm mate;200,0;286,0;
Ascale;Grupo 2;IMPERIA SILVER;12 mm mate;200,0;286,0;
Ascale;Grupo 2;INFINITY WHITE;12 mm mate;200,0;286,0;
Ascale;Grupo 2;LAURENT BLACK;12 mm mate;200,0;286,0;
Ascale;Grupo 2;LABRADORITE ROYAL BLUE;12 mm mate;200,0;286,0;
Ascale;Grupo 2;MACCHIA VECCHIA GOLD;12 mm mate;200,0;286,0;
Ascale;Grupo 2;MARQUINA BLACK;12 mm mate;200,0;286,0;
Ascale;Grupo 2;MILLENIUM COPPER;12 mm mate;200,0;286,0;
Ascale;Grupo 2;MOMA RUTELL;12 mm mate;200,0;286,0;
Ascale;Grupo 2;MOON BLACK;12 mm mate;200,0;286,0;
Ascale;Grupo 2;MONTBLANC WHITE;12 mm mate;200,0;286,0;
Ascale;Grupo 2;MONTECLEMO BLACK;12 mm mate;200,0;286,0;
Ascale;Grupo 2;MONTECLEMO SILVER;12 mm mate;200,0;286,0;
Ascale;Grupo 2;TAJ MAHAL ALMOND;12 mm mate;200,0;286,0;
Ascale;Grupo 2;TIVOLI WHITE;12 mm mate;200,0;286,0;
Ascale;Grupo 2;TORANO STATUARIO;12 mm mate;200,0;286,0;
Ascale;Grupo 2;VAGLI GOLD;12 mm mate;200,0;286,0;
Ascale;Grupo 2;URBAN WHITE;12 mm mate;200,0;286,0;
Ascale;Grupo 2;CRYSTAL LUX WHITE;12 mm mate;200,0;286,0;
Ascale;Grupo 3;VARESE ONICE;12 mm mate;247,0;352,0;
Ascale;Grupo 3;ONICE BLUE;12 mm mate;247,0;352,0;
Ascale;Grupo 3;ONICE BLACK;12 mm mate;247,0;352,0;
Ascale;Grupo 3;ONICE SEAGREEN;12 mm mate;247,0;352,0;
Ascale;Grupo 3;ONICE LUX WHITE;12 mm mate;247,0;352,0;
Ascale;Grupo 3;PATAGONIA GOLD;12 mm mate;247,0;352,0;
Ascale;Grupo 3;CALACATTA VIOLA;12 mm mate;247,0;352,0;
Coverlam;Tipo Marmol;CALACATA NAT. Y PUL.;12 mm mate;160,0;230,0;
Coverlam;Tipo Marmol;CORINO NATURAL;12 mm mate;160,0;230,0;
Coverlam;Tipo Marmol;DUOMO NAT. Y PUL.;12 mm mate;160,0;230,0;
Coverlam;Tipo Marmol;CUARZO RENO NAT. Y PUL.;12 mm mate;160,0;230,0;
Coverlam;Tipo Marmol;ICEBERG NAT. Y PUL.;12 mm mate;160,0;230,0;
Coverlam;Tipo Marmol;PALADIO NATURAL;12 mm mate;160,0;230,0;
Coverlam;Tipo Marmol;NERO ARDI;12 mm mate;160,0;230,0;
Coverlam;Tipo Marmol;ESTATUARIO NAT. Y PUL.;12 mm mate;160,0;230,0;
Coverlam;Tipo Piedra;BLUESTONE GRIS;12 mm mate;160,0;230,0;
Coverlam;Tipo Piedra;CAMARGUE BLANCO;12 mm mate;160,0;230,0;
Coverlam;Tipo Piedra;CAMARGUE ARENA;12 mm mate;160,0;230,0;
Coverlam;Tipo Piedra;BASALTINA NEGRO;12 mm mate;160,0;230,0;
Coverlam;Tipo Metal;DISTRITO ALUMINIO;12 mm mate;160,0;230,0;
Coverlam;Tipo Metal;DISTRITO IRON;12 mm mate;160,0;230,0;
Coverlam;Tipo Metal;LAVA CORTEN;12 mm mate;160,0;230,0;
Coverlam;Tipo Metal;LAVA IRON;12 mm mate;160,0;230,0;
Coverlam;Tipo Monocolor;BASIC BLANCO NAT. Y PUL.;12 mm mate;160,0;230,0;
Coverlam;Tipo Monocolor;BASIC TAUPE;12 mm mate;160,0;230,0;
Coverlam;Tipo Monocolor;BASIC CEMENTO;12 mm mate;160,0;230,0;
Coverlam;Tipo Monocolor;TITAN CEMENTO;12 mm mate;160,0;230,0;
Coverlam;Tipo Monocolor;TITAN ANTRACITA;12 mm mate;160,0;230,0;
Coverlam;Tipo Madera;IRATI ABETO;12 mm mate;160,0;230,0;
Coverlam;Tipo Madera;IRATI NOGAL;12 mm mate;160,0;230,0;
Coverlam;Tipo Madera;JUNGLA IROCO;12 mm mate;160,0;230,0;
Coverlam;Tipo Madera;JUNGLA ROBLE;12 mm mate;160,0;230,0;
Infinity;Grupo 1;TOTAL WHITE;12 mm mate;160,0;230,0;
Infinity;Grupo 1;TOTAL GREY;12 mm mate;160,0;230,0;
Infinity;Grupo 1;TOTAL BLACK;12 mm mate;160,0;230,0;
Infinity;Grupo 1;CONCRETE LIGHT;12 mm mate;160,0;230,0;
Infinity;Grupo 1;CONCRETE GREY;12 mm mate;160,0;230,0;
Infinity;Grupo 1;TERRAZZO WHITE;12 mm mate;160,0;230,0;
Infinity;Grupo 1;LATIN;12 mm mate;160,0;230,0;
Infinity;Grupo 1;PIGALLE;12 mm mate;160,0;230,0;
Infinity;Grupo 1;SKAV-MADERA;12 mm mate;160,0;230,0;
Infinity;Grupo 1;BERCY;12 mm mate;160,0;230,0;
Infinity;Grupo 2;CALACATTA ORO (A+B);12 mm mate;198,0;282,0;
Infinity;Grupo 2;CALACATTA LINCOLN (GLORY);12 mm mate;198,0;282,0;
Infinity;Grupo 2;CALACATTA HERMITAGE (A+B);12 mm mate;198,0;282,0;
Infinity;Grupo 2;CLASSIC STATUARIO (A+B);12 mm mate;198,0;282,0;
Infinity;Grupo 2;EXTRA STATUARIO (A+B);12 mm mate;198,0;282,0;
Infinity;Grupo 2;CALACATTA AURUN (A+B) DEFENCE;12 mm mate;198,0;282,0;
Infinity;Grupo 2;ABSOLUTE WHITE;12 mm mate;198,0;282,0;
Infinity;Grupo 2;ABSOLUTE BLACK;12 mm mate;198,0;282,0;
Infinity;Grupo 2;PIETRA GREY;12 mm mate;198,0;282,0;
Infinity;Grupo 2;ATLANTIS GREY;12 mm mate;198,0;282,0;
Infinity;Grupo 2;TUNDRA SELECT;12 mm mate;198,0;282,0;
Infinity;Grupo 2;TRAVERTINO CHIARO;12 mm mate;198,0;282,0;
Infinity;Grupo 2;TRAVERTINO GREY;12 mm mate;198,0;282,0;
Infinity;Grupo 2;METAL CORTEN;12 mm mate;198,0;282,0;
Infinity;Grupo 2;METAL DARK;12 mm mate;198,0;282,0;
Infinity;Grupo 2;CRYSTAL ICE;12 mm mate;198,0;282,0;
Infinity;Grupo 2;SAHARA NOIR (A+B);12 mm mate;198,0;282,0;
Infinity;Grupo 2;ROYAL (A+B) LAURENT;12 mm mate;198,0;282,0;
Infinity;Grupo 2;CHIANCA DI OSTUNI;12 mm mate;198,0;282,0;
Infinity;Grupo 2;PULPIS BRONW;12 mm mate;198,0;282,0;
Infinity;Grupo 2;PATAGONIA / MAGALLANO;12 mm mate;198,0;282,0;
Infinity;Grupo 2;BUXY SELECT;12 mm mate;198,0;282,0;
Infinity;Grupo 2;MILAN STONE;12 mm mate;198,0;282,0;
Infinity;Grupo 2;NERO MARQUINA;12 mm mate;198,0;282,0;
Infinity;Serie Pavarotti;CALCATTA VIOLA;12 mm pulido;270,0;385,0;
Infinity;Serie Pavarotti;ONYX WHITE;12 mm pulido;270,0;385,0;
Infinity;Serie Pavarotti;PANDA WHITE;12 mm pulido;270,0;385,0;
Infinity;Serie Pavarotti;ICONIC CIPOLLINO;12 mm pulido;270,0;385,0;
Infinity;Serie Pavarotti;ROYAL PEACOCK;12 mm pulido;270,0;385,0;
Infinity;Serie Pavarotti;VERDE FRANCE;12 mm pulido;270,0;385,0;
Infinity;Serie Pavarotti;OROBICO LUXE;12 mm pulido;270,0;385,0;
Infinity;Serie Pavarotti;ROSSO DOMUS;12 mm pulido;270,0;385,0;
Infinity;Serie Pavarotti;OCEAN BLUE;12 mm pulido;270,0;385,0;
Infinity;Serie Pavarotti;PRECIOUS SODALITE;12 mm pulido;270,0;385,0;
Infinity;Serie Pavarotti;THUNDERSTORM;12 mm pulido;270,0;385,0;
Infinity;Serie Pavarotti;SANTOS;12 mm pulido;270,0;385,0;
Dekton;Grupo 0;AERIS;;195,0;280,0;
Dekton;Grupo 0;DANAE;;195,0;280,0;
Dekton;Grupo 0;ETER;;195,0;280,0;
Dekton;Grupo 0;KEON;;195,0;280,0;
Dekton;Grupo 0;DUNNA;;195,0;280,0;
Dekton;Grupo 0;MOONE;;195,0;280,0;
Dekton;Grupo 1;BROMO;;248,0;356,0;
Dekton;Grupo 1;FOSSIL;;248,0;356,0;
Dekton;Grupo 1;SASEA;;248,0;356,0;
Dekton;Grupo 1;SIRIUS;;248,0;356,0;
Dekton;Grupo 1;KAIROS 22;;248,0;356,0;
Dekton;Grupo 1;KOVIK;;248,0;356,0;
Dekton;Grupo 1;KRETA;;248,0;356,0;
Dekton;Grupo 1;NILIUM;;248,0;356,0;
Dekton;Grupo 1;VALTERRA;;248,0;356,0;
Dekton;Grupo 2;DOMMOS;;290,0;415,0;
Dekton;Grupo 2;KELYA;;290,0;415,0;
Dekton;Grupo 2;KIRA;;290,0;415,0;
Dekton;Grupo 2;LAOS;;290,0;415,0;
Dekton;Grupo 2;LUNAR 22;;290,0;415,0;
Dekton;Grupo 2;SOKE;;290,0;415,0;
Dekton;Grupo 2;TRILIUM;;290,0;415,0;
Dekton;Grupo 2;ZENITH;;290,0;415,0;
Dekton;Grupo 2;ALBARIUM;;290,0;415,0;
Dekton;Grupo 2;ARGENTIUM;;290,0;415,0;
Dekton;Grupo 2;AVORIO;;290,0;415,0;
Dekton;Grupo 2;CEPPO;;290,0;415,0;
Dekton;Grupo 2;GRAFITE;;290,0;415,0;
Dekton;Grupo 2;GRIGIO;;290,0;415,0;
Dekton;Grupo 2;MARINA;;290,0;415,0;
Dekton;Grupo 2;MARMORIO;;290,0;415,0;
Dekton;Grupo 2;MICRON;;290,0;415,0;
Dekton;Grupo 2;NACRE;;290,0;415,0;
Dekton;Grupo 2;NEBBIA;;290,0;415,0;
Dekton;Grupo 2;UMBER;;290,0;415,0;
Dekton;Grupo 2;SABBIA;;290,0;415,0;
Dekton;Grupo 3;AURA 22;;337,0;482,0;
Dekton;Grupo 3;ENTZO 22;;337,0;482,0;
Dekton;Grupo 3;LAURENT;;337,0;482,0;
Dekton;Grupo 3;NATURA 22;;337,0;482,0;
Dekton;Grupo 3;OPERA;;337,0;482,0;
Dekton;Grupo 3;REM;;337,0;482,0;
Dekton;Grupo 3;DAZE;;337,0;482,0;
Dekton;Grupo 3;NEURAL;;337,0;482,0;
Dekton;Grupo 3;MORPHEUS;;337,0;482,0;
Dekton;Grupo 3;REVERIE;;337,0;482,0;
Dekton;Grupo 3;KURO C.SOON;;337,0;482,0;
Dekton;Grupo 3;SOMNIA;;337,0;482,0;
Dekton;Grupo 3;UYUNI;;337,0;482,0;
Dekton;Grupo 4;ARGA;;407,0;580,0;
Dekton;Grupo 4;BERGEN;;407,0;580,0;
Dekton;Grupo 4;HALO;;407,0;580,0;
Dekton;Grupo 4;HELENA;;407,0;580,0;
Dekton;Grupo 4;KHALO;;407,0;580,0;
Dekton;Grupo 4;MORPHEUS BOOKMATCH;;407,0;580,0;
Dekton;Grupo 4;SOMNIA LINEALMATCH;;407,0;580,0;
Dekton;Grupo 4;AWAKE;;407,0;580,0;
Dekton;Grupo 4;LUCID;;407,0;580,0;
Dekton;Grupo 4;TRANGE;;407,0;580,0;
Dekton;Grupo 4;VIGIL;;407,0;580,0;
Dekton;Grupo 4;TAGA;;407,0;580,0;
Dekton;Grupo 5;AWAKE BOOKMATCH;;490,0;700,0;
Dekton;Grupo 5;LUCID BOOKMATCH;;490,0;700,0;
Dekton;Grupo 5;TRANCE BOOKMATCH;;490,0;700,0;
Silestone;Grupo 1;BLANCO NORTE;20 mm;177,0;253,0;
Silestone;Grupo 1;BLANCO CITY;20 mm;177,0;253,0;
Silestone;Grupo 1;GRIS EXPO;20 mm;177,0;253,0;
Silestone;Grupo 1;MARENGO;20 mm;177,0;253,0;
Silestone;Grupo 1;NOKA;20 mm;177,0;253,0;
Silestone;Grupo 1;ROUGUI;20 mm;177,0;253,0;
Silestone;Grupo 2;BLANCO MAPLE;20 mm;208,0;297,0;
Silestone;Grupo 2;CEMENTO SPA;20 mm;208,0;297,0;
Silestone;Grupo 2;CORAL CLAY COLOUR;20 mm;208,0;297,0;
Silestone;Grupo 2;MIAMI WHITE 17;20 mm;208,0;297,0;
Silestone;Grupo 2;NEGRO TEBAS 18;20 mm;208,0;297,0;
Silestone;Grupo 2;NIEBLA;20 mm;208,0;297,0;
Silestone;Grupo 2;WHITE STORM 14;20 mm;208,0;297,0;
Silestone;Grupo 3;ARIEL;20 mm;225,0;320,0;
Silestone;Grupo 3;DESERT SILVER;20 mm;225,0;320,0;
Silestone;Grupo 3;MIAMI VENA;20 mm;225,0;320,0;
Silestone;Grupo 3;SNOWY IBIZA;20 mm;225,0;320,0;
Silestone;Grupo 3;BLANCO STELLAR;20 mm;225,0;320,0;
Silestone;Grupo 3;LAGOON;20 mm;225,0;320,0;
Silestone;Grupo 3;NEGRO STELLAR;20 mm;225,0;320,0;
Silestone;Grupo 3;YUKON;20 mm;225,0;320,0;
Silestone;Grupo 4;ARCILLA RED (solo suede);20 mm;317,0;453,0;
Silestone;Grupo 4;BLANCO ZEUS;20 mm;317,0;453,0;
Silestone;Grupo 4;CALA BLUE (solo suede);20 mm;317,0;453,0;
Silestone;Grupo 4;CHARCOAL SOAPSTONE;20 mm;317,0;453,0;
Silestone;Grupo 4;CORKTOWN (solo suede);20 mm;317,0;453,0;
Silestone;Grupo 4;ETERNAL SERENA;20 mm;317,0;453,0;
Silestone;Grupo 4;FARO WHITE (solo suede);20 mm;317,0;453,0;
Silestone;Grupo 4;KENSHO;20 mm;317,0;453,0;
Silestone;Grupo 4;NOLITA (solo suede);20 mm;317,0;453,0;
Silestone;Grupo 4;PEARL JASMINE;20 mm;317,0;453,0;
Silestone;Grupo 4;SEAPORT (solo suede);20 mm;317,0;453,0;
Silestone;Grupo 4;POSIDONIA GREEN (solo suede);20 mm;317,0;453,0;
Silestone;Grupo 4;POBLENOU (solo suede);20 mm;317,0;453,0;
Silestone;Grupo 5;CALYPSO;20 mm;348,0;503,0;
Silestone;Grupo 5;ETERNAL MARFIL;20 mm;348,0;503,0;
Silestone;Grupo 5;ETERNAL MARQUINA;20 mm;348,0;503,0;
Silestone;Grupo 5;ETERNAL STATUARIO;20 mm;348,0;503,0;
Silestone;Grupo 5;ICONIC WHITE;20 mm;348,0;503,0;
Silestone;Grupo 6;ETERNAL CALACATA GOLD;20 mm;423,0;605,0;
Silestone;Grupo 6;ETERNAL NOIR;20 mm;423,0;605,0;
Silestone;Grupo 6;ETERNAL DUSK;20 mm;423,0;605,0;
Silestone;Grupo 6;ETERNAL GLOW;20 mm;423,0;605,0;
Silestone;Grupo 6;ETERNAL NOCTIS;20 mm;423,0;605,0;
Silestone;Grupo 7;BOHEMIAN FLAME;20 mm;475,0;678,0;
Silestone;Grupo 7;ELECTRIC PEARL;20 mm;475,0;678,0;
Silestone;Grupo 7;PARISIEN BLEU;20 mm;475,0;678,0;
Silestone;Grupo 7;ROMANTIC ASH;20 mm;475,0;678,0;
Silestone;Grupo 7;VERSAILLES IVORY;20 mm;475,0;678,0;
Silestone;Grupo 7;VICTORIAN SILVER;20 mm;475,0;678,0;
Silestone;Grupo 7;BOHEMIAN FLAME (suede);20 mm;475,0;678,0;
Silestone;Grupo 7;ELECTRIC PEARL (suede);20 mm;475,0;678,0;
Silestone;Grupo 7;ROMANTIC ASH (suede);20 mm;475,0;678,0;
Topzstone;Grupo 1;COCONUT/BLANCO PALOMA/1008;20 mm;138,0;198,0;
Topzstone;Grupo 1;CONCRET/CONCRETE/1009;20 mm;138,0;198,0;
Topzstone;Grupo 1;CITY/GRIS TOLEDO/1002;20 mm;138,0;198,0;
Topzstone;Grupo 1;VANILLA/IVORY CREAM/1013;20 mm;138,0;198,0;
Topzstone;Grupo 1;NARÓN/NEGRO NARÓN/4053;20 mm;138,0;198,0;
Topzstone;Grupo 2;BELGIAN BLUE / 5007;20 mm;162,0;231,0;
Topzstone;Grupo 2;MOON / 3009;20 mm;162,0;231,0;
Topzstone;Grupo 2;WHITE PARTY / 1010;20 mm;162,0;231,0;
Topzstone;Grupo 3;ABSOLUT WHITE / 1017;20 mm;177,0;253,0;
Topzstone;Grupo 3;BLACK LIGHTS / 5010;20 mm;177,0;253,0;
Topzstone;Grupo 3;CRUSH / 2021;20 mm;177,0;253,0;
Topzstone;Grupo 3;DELICATTO CREAM / 2011;20 mm;177,0;253,0;
Topzstone;Grupo 3;GREY LIGHTS / 1004;20 mm;177,0;253,0;
Topzstone;Grupo 3;LIGHT SHADOW / 5004;20 mm;177,0;253,0;
Topzstone;Grupo 3;ABSOLUT BLACK / 1024;20 mm;177,0;253,0;
Topzstone;Grupo 3;NOCCIOLA / 5002;20 mm;177,0;253,0;
Topzstone;Grupo 3;ROYAL / 1021;20 mm;177,0;253,0;
Topzstone;Grupo 3;WHITE BRILIANT / 7001;20 mm;177,0;253,0;
Topzstone;Grupo 3;WHITE LIGHTS / 1016;20 mm;177,0;253,0;
Topzstone;Grupo 4;VANGUARD CARRARA / 2010;20 mm;219,0;312,0;
Topzstone;Grupo 5;CRYSTAL / 7525;20 mm;219,0;312,0;
Topzstone;Grupo 6;ALABASTER WHITE / HIMALAYA 2038;20 mm;229,0;325,0;
Topzstone;Grupo 6;ALABASTER BLACK / HIMALAYA 2048;20 mm;229,0;325,0;
Topzstone;Grupo 6;VENATINO SFUMATTO / 2031;20 mm;229,0;325,0;
Topzstone;Grupo 6;BRECKENRIDGE / 2060;20 mm;229,0;325,0;
Topzstone;Grupo 6;MIAMI GOLD / 2053;20 mm;229,0;325,0;
Topzstone;Grupo 6;LIBERTY BELL / 2058;20 mm;229,0;325,0;
Topzstone;Grupo 6;SPANISH BLACK / 2056;20 mm;229,0;325,0;
Topzstone;Grupo 7;FERRARA GOLD;20 mm;270,0;385,0;
Terra Granitos;Grupo 0;PERSIA BIANCA;;158,0;225,0;
Terra Granitos;Grupo 0;ARTICA;;158,0;225,0;
Terra Granitos;Grupo 1;MARE;;185,0;263,0;
Terra Granitos;Grupo 2;ALSIA;;210,0;300,0;
Terra Granitos;Grupo 3;TROPICAL STORM;;264,0;375,0;
Terra Granitos;Grupo 3;SAN GIOVANNI;;264,0;375,0;
Terra Granitos;Grupo 4;GOIANA;;358,0;512,0;
Terra Granitos;Grupo 5;PARANA;;420,0;600,0;
Terra Granitos;Grupo 6;BRUMA;;455,0;650,0;
Terra Granitos;Grupo 6;OPALO;;455,0;650,0;
Terra Granitos;Grupo 7;POLARIS;;483,0;690,0;
Terra Granitos;Grupo 7;ORIELLA;;483,0;690,0;
Granitos;Grupo A;BLANCO DIAMANTE;;95,0;133,0;21,0
Granitos;Grupo A;ROSA PORRIÑO;;95,0;133,0;21,0
Granitos;Grupo A;SALVATIERRA;;95,0;133,0;21,0
Granitos;Grupo B;GRIS PERLA;;98,0;138,0;23,0
Granitos;Grupo C;BLANCO CRISTAL;;128,0;182,0;29,0
Granitos;Grupo C;SILVER WHITE;;128,0;182,0;29,0
Granitos;Grupo C;ROSAVEL;;128,0;182,0;29,0
Granitos;Grupo C;ROSA VILLAR;;128,0;182,0;29,0
Granitos;Grupo C;CASTAÑO VERDOSO;;128,0;182,0;29,0
Granitos;Grupo D;NEGRO SUDAFRICA;;136,0;211,0;34,0
Granitos;Grupo D;VERDE UBATUBA;;136,0;211,0;34,0
Granitos;Grupo E;MULTICOLO ROJO;;170,0;242,0;41,0
Granitos;Grupo E;VERDE PRADERA;;170,0;242,0;41,0
Granitos;Grupo E;NEGRO AUSTRAL;;170,0;242,0;41,0
Granitos;Grupo E;VISCOUNT WHITE;;170,0;242,0;41,0
Granitos;Grupo E;ROSA DALBA;;170,0;242,0;41,0
Granitos;Grupo E;VERDE OLIVA;;170,0;242,0;41,0
Granitos;Grupo F;AMARILLO BRASIL;;177,0;252,0;43,0
Granitos;Grupo F;GALAXY;;177,0;252,0;43,0
Granitos;Grupo F;LEMON ICE;;177,0;252,0;43,0
Granitos;Grupo F;VERDE MULTICOLOR;;177,0;252,0;43,0
Granitos;Grupo F;BLACK WHITE;;177,0;252,0;43,0
Granitos;Grupo F;MULTICOLOR SALMON;;177,0;252,0;43,0
Granitos;Grupo F;VERDE EUCALIPTO;;177,0;252,0;43,0
Granitos;Grupo F;COLONIAL WHITE;;177,0;252,0;43,0
Granitos;Grupo F;SIVAKASHI;;177,0;252,0;43,0
Granitos;Grupo F;SILVER BLACK;;177,0;252,0;43,0
Granitos;Grupo F;CASIMIR GOLD;;177,0;252,0;43,0
Granitos;Grupo G;LABRADOR CLARO;;168,0;239,0;37,0
Granitos;Grupo G;LABRADOR OSCURO;;168,0;239,0;37,0
Granitos;Grupo H;NEGRO ZIMBAEW (GALAXY);;173,0;237,0;38,0

Categoría;Concepto;€
Cantos;Canto recto;8,5
Cantos;Canto doble recto con junta;30
Cantos;Canto doble recto sin junta;30
Cantos;Canto romo;26,5
Cantos;Canto doble romo;34,5
Cantos;Canto doble biselado;34,5
Cantos;Canto ingletado 6 cm;62
Huecos y fregaderos;Hueco sobre encimera;20
Huecos y fregaderos;Hueco bajo encimera;75
Huecos y fregaderos;Hueco plano inclinado;300
Huecos y fregaderos;Hueco con estrías rectas;220
Huecos y fregaderos;Hueco con estrías onduladas;220
Huecos y fregaderos;Hueco de grifo;13
Huecos y fregaderos;Cajas;20
Colocación;Colocación aplacado;60
Colocación;Colocación de bancada;120
`;
