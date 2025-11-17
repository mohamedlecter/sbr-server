/**
 * Database Seeding Script - Uses provided JSON data and fetches models from RapidAPI
 * * This script:
 * 1. Clears existing brands, categories, and models
 * 2. Inserts makes from provided JSON data as brands
 * 3. Inserts categories from provided JSON data
 * 4. Fetches models for famous brands only (to respect rate limits)
 * 5. Adds a default administrative user.
 * * Usage:
 * npm run seed
 * * Note: Make sure to run the migration first if you haven't already:
 * node src/database/migrate_add_models.js
 */

const { query } = require('./connection');
const https = require('https');
// NOTE: You will need to install and configure 'bcrypt' or a similar library 
// and implement the actual hashPassword function in your project.
const { hashPassword } = require('./auth/utils'); // Placeholder for password hashing

const API_KEY = 'a9e3502d15msh462887bed5f186dp1d18c0jsn53d570692a14';
const API_HOST = 'motorcycle-specs-database.p.rapidapi.com';

// Provided makes/brands JSON data
const MAKES_DATA = [
  { "id": "1", "name": "Acabion" },
  { "id": "2", "name": "Access" },
  { "id": "3", "name": "Ace" },
  { "id": "4", "name": "Adiva" },
  { "id": "5", "name": "Adler" },
  { "id": "6", "name": "Adly" },
  { "id": "7", "name": "Aeon" },
  { "id": "8", "name": "Aermacchi" },
  { "id": "9", "name": "Agrati" },
  { "id": "10", "name": "AJP" },
  { "id": "11", "name": "AJS" },
  { "id": "12", "name": "Alfer" },
  { "id": "13", "name": "Alligator" },
  { "id": "14", "name": "Allstate" },
  { "id": "15", "name": "AlphaSports" },
  { "id": "16", "name": "Alta" },
  { "id": "17", "name": "Amazonas" },
  { "id": "18", "name": "American Eagle" },
  { "id": "19", "name": "American IronHorse" },
  { "id": "20", "name": "APC" },
  { "id": "574", "name": "Apollino" },
  { "id": "563", "name": "Apollo" },
  { "id": "21", "name": "Aprilia" },
  { "id": "531", "name": "Apsonic" },
  { "id": "22", "name": "Arch" },
  { "id": "573", "name": "Archive" },
  { "id": "23", "name": "Arctic Cat" },
  { "id": "24", "name": "Ardie" },
  { "id": "25", "name": "Ariel" },
  { "id": "26", "name": "Arlen Ness" },
  { "id": "27", "name": "Arqin" },
  { "id": "581", "name": "Ascend" },
  { "id": "28", "name": "Askoll" },
  { "id": "29", "name": "Aspes" },
  { "id": "30", "name": "Ather" },
  { "id": "31", "name": "ATK" },
  { "id": "32", "name": "Atlas Honda" },
  { "id": "33", "name": "Aurora" },
  { "id": "34", "name": "Avinton" },
  { "id": "35", "name": "Avon" },
  { "id": "36", "name": "Azel" },
  { "id": "37", "name": "Bajaj" },
  { "id": "38", "name": "Balkan" },
  { "id": "532", "name": "Baltmotors" },
  { "id": "39", "name": "BamX" },
  { "id": "40", "name": "Baotian" },
  { "id": "41", "name": "Barossa" },
  { "id": "42", "name": "Beeline" },
  { "id": "575", "name": "Benda" },
  { "id": "43", "name": "Benelli" },
  { "id": "44", "name": "Bennche" },
  { "id": "45", "name": "Beta" },
  { "id": "46", "name": "Better" },
  { "id": "47", "name": "Big Bear Choppers" },
  { "id": "48", "name": "Big Dog" },
  { "id": "49", "name": "Bimota" },
  { "id": "50", "name": "Bintelli" },
  { "id": "51", "name": "Black Douglas" },
  { "id": "52", "name": "Blackburne" },
  { "id": "53", "name": "Blata" },
  { "id": "533", "name": "Bluroc" },
  { "id": "54", "name": "BMC Choppers" },
  { "id": "55", "name": "BMW" },
  { "id": "56", "name": "Boom Trikes" },
  { "id": "57", "name": "Borile" },
  { "id": "58", "name": "Boss Hoss" },
  { "id": "59", "name": "Bourget" },
  { "id": "60", "name": "BPG" },
  { "id": "508", "name": "BPG Werks" },
  { "id": "61", "name": "Brammo" },
  { "id": "62", "name": "Bridgestone" },
  { "id": "63", "name": "Brixton" },
  { "id": "64", "name": "Brough Superior" },
  { "id": "65", "name": "Brudeli" },
  { "id": "66", "name": "BSA" },
  { "id": "67", "name": "BSA Motors" },
  { "id": "68", "name": "BucciMoto" },
  { "id": "69", "name": "Buell" },
  { "id": "509", "name": "Bullit" },
  { "id": "70", "name": "Bultaco" },
  { "id": "71", "name": "Cagiva" },
  { "id": "72", "name": "California Scooter" },
  { "id": "73", "name": "Can-Am" },
  { "id": "534", "name": "Capirelli" },
  { "id": "74", "name": "Cargobike" },
  { "id": "75", "name": "Caterham" },
  { "id": "76", "name": "CCM" },
  { "id": "77", "name": "Cectek" },
  { "id": "78", "name": "CF Moto" },
  { "id": "79", "name": "CH Racing" },
  { "id": "80", "name": "Chang-Jiang" },
  { "id": "81", "name": "Cheetah" },
  { "id": "510", "name": "Christini" },
  { "id": "82", "name": "Clarke" },
  { "id": "83", "name": "Cleveland" },
  { "id": "84", "name": "Clipic" },
  { "id": "85", "name": "CMC" },
  { "id": "86", "name": "Cobra" },
  { "id": "535", "name": "Combat Motors" },
  { "id": "87", "name": "Confederate" },
  { "id": "88", "name": "Cosmos Muscle Bikes" },
  { "id": "89", "name": "Cotton" },
  { "id": "90", "name": "Coventry Eagle" },
  { "id": "91", "name": "Covingtons" },
  { "id": "92", "name": "CPI" },
  { "id": "93", "name": "CR&S" },
  { "id": "94", "name": "Crocker" },
  { "id": "511", "name": "CSC Motorcycles" },
  { "id": "95", "name": "CSR" },
  { "id": "96", "name": "Current Motor" },
  { "id": "97", "name": "Curtiss" },
  { "id": "98", "name": "Cushman" },
  { "id": "99", "name": "CZ" },
  { "id": "100", "name": "Daelim" },
  { "id": "101", "name": "Dafier" },
  { "id": "102", "name": "Dafra" },
  { "id": "103", "name": "Dam" },
  { "id": "512", "name": "Damon" },
  { "id": "104", "name": "Dandy" },
  { "id": "564", "name": "Davinci" },
  { "id": "105", "name": "Dayang" },
  { "id": "106", "name": "Dayton" },
  { "id": "107", "name": "Dayun" },
  { "id": "108", "name": "DB Motors" },
  { "id": "109", "name": "De Dion-Bouton" },
  { "id": "536", "name": "Delfast" },
  { "id": "110", "name": "Demak" },
  { "id": "111", "name": "Derbi" },
  { "id": "112", "name": "Derringer" },
  { "id": "113", "name": "DF Motor" },
  { "id": "114", "name": "Dfang" },
  { "id": "115", "name": "Di Blasi" },
  { "id": "116", "name": "Diamo" },
  { "id": "117", "name": "Dihao" },
  { "id": "555", "name": "Dinamo" },
  { "id": "118", "name": "Dinli" },
  { "id": "119", "name": "Dirico" },
  { "id": "120", "name": "DKW" },
  { "id": "121", "name": "Dnepr" },
  { "id": "513", "name": "Docker" },
  { "id": "122", "name": "Dodge" },
  { "id": "123", "name": "Donghai" },
  { "id": "124", "name": "Douglas" },
  { "id": "125", "name": "Drysdale" },
  { "id": "126", "name": "Ducati" },
  { "id": "127", "name": "Dürkopp" },
  { "id": "128", "name": "E-max" },
  { "id": "129", "name": "E-Racer" },
  { "id": "130", "name": "E-Ton" },
  { "id": "131", "name": "E-Tropolis" },
  { "id": "132", "name": "Eagle-Wing" },
  { "id": "133", "name": "Ebretti" },
  { "id": "134", "name": "Eccity" },
  { "id": "576", "name": "Ecooter" },
  { "id": "135", "name": "Ecosse" },
  { "id": "136", "name": "eCRP" },
  { "id": "137", "name": "EKO" },
  { "id": "138", "name": "Electric City" },
  { "id": "537", "name": "Electric Motion" },
  { "id": "139", "name": "Emblem" },
  { "id": "140", "name": "emco" },
  { "id": "141", "name": "Energica" },
  { "id": "142", "name": "Enfield" },
  { "id": "143", "name": "Erik Buell Racing" },
  { "id": "549", "name": "Evader" },
  { "id": "144", "name": "Evolet" },
  { "id": "145", "name": "Evolve" },
  { "id": "146", "name": "Excelsior" },
  { "id": "147", "name": "Exile Cycles" },
  { "id": "148", "name": "Factory Bike" },
  { "id": "149", "name": "Falcon" },
  { "id": "150", "name": "Fantic" },
  { "id": "151", "name": "FB Mondial" },
  { "id": "565", "name": "Felo" },
  { "id": "152", "name": "FGR" },
  { "id": "153", "name": "Fischer" },
  { "id": "154", "name": "Flying Merkel" },
  { "id": "155", "name": "Flyrite Choppers" },
  { "id": "156", "name": "Fokamo" },
  { "id": "157", "name": "Fosti" },
  { "id": "556", "name": "Fuego" },
  { "id": "158", "name": "FX Bikes" },
  { "id": "159", "name": "G&G" },
  { "id": "160", "name": "Garelli" },
  { "id": "161", "name": "GAS GAS" },
  { "id": "162", "name": "Geely" },
  { "id": "163", "name": "Genata" },
  { "id": "164", "name": "Generic" },
  { "id": "165", "name": "Genuine Scooter" },
  { "id": "538", "name": "Geon" },
  { "id": "166", "name": "GG" },
  { "id": "167", "name": "Ghezzi-Brian" },
  { "id": "168", "name": "Giantco" },
  { "id": "169", "name": "Gibbs" },
  { "id": "170", "name": "Gilera" },
  { "id": "171", "name": "Goes" },
  { "id": "172", "name": "Gogo Moto" },
  { "id": "173", "name": "Gogoro" },
  { "id": "174", "name": "Govecs" },
  { "id": "566", "name": "GPX Moto" },
  { "id": "175", "name": "GRC Moto" },
  { "id": "176", "name": "GreenTrans" },
  { "id": "177", "name": "Greeves" },
  { "id": "539", "name": "Gymotor" },
  { "id": "178", "name": "Hadin" },
  { "id": "557", "name": "Hamachi" },
  { "id": "179", "name": "Hanway" },
  { "id": "180", "name": "Haojin" },
  { "id": "540", "name": "Haojue" },
  { "id": "181", "name": "Harley-Davidson" },
  { "id": "182", "name": "Hartford" },
  { "id": "183", "name": "HDM" },
  { "id": "184", "name": "Headbanger" },
  { "id": "185", "name": "Heinkel" },
  { "id": "186", "name": "Henderson" },
  { "id": "187", "name": "Herald" },
  { "id": "188", "name": "Hercules" },
  { "id": "189", "name": "Hero" },
  { "id": "190", "name": "Hero Electric" },
  { "id": "191", "name": "Hero Honda" },
  { "id": "192", "name": "Hesketh" },
  { "id": "193", "name": "Highland" },
  { "id": "194", "name": "Hildebrand-Wolfmüller" },
  { "id": "195", "name": "HM" },
  { "id": "196", "name": "Honda" },
  { "id": "197", "name": "Horex" },
  { "id": "514", "name": "Horwin" },
  { "id": "198", "name": "HP Power" },
  { "id": "199", "name": "Hunter" },
  { "id": "200", "name": "Husaberg" },
  { "id": "201", "name": "Husqvarna" },
  { "id": "202", "name": "Hyosung" },
  { "id": "203", "name": "Ice Bear" },
  { "id": "204", "name": "Indian" },
  { "id": "205", "name": "Innoscooter" },
  { "id": "206", "name": "Intrepid" },
  { "id": "207", "name": "Irbis" },
  { "id": "208", "name": "Italika" },
  { "id": "209", "name": "Italjet" },
  { "id": "515", "name": "Italmoto" },
  { "id": "210", "name": "IZH" },
  { "id": "211", "name": "Izuka" },
  { "id": "212", "name": "James" },
  { "id": "213", "name": "Janus" },
  { "id": "214", "name": "Jawa" },
  { "id": "215", "name": "Jawa-CZ" },
  { "id": "216", "name": "Jialing" },
  { "id": "217", "name": "Jianshe" },
  { "id": "218", "name": "Jincheng" },
  { "id": "219", "name": "Jinlun" },
  { "id": "541", "name": "Johammer" },
  { "id": "220", "name": "Johnny Pag" },
  { "id": "221", "name": "Jonway" },
  { "id": "222", "name": "Jordan" },
  { "id": "223", "name": "Jotagas" },
  { "id": "224", "name": "JRL" },
  { "id": "225", "name": "Junak" },
  { "id": "226", "name": "K2O" },
  { "id": "227", "name": "Kabirdass" },
  { "id": "228", "name": "Kangda" },
  { "id": "229", "name": "Kanuni" },
  { "id": "230", "name": "Kasinski" },
  { "id": "231", "name": "Kawasaki" },
  { "id": "232", "name": "Kayo" },
  { "id": "233", "name": "Keeway" },
  { "id": "558", "name": "Kenbo" },
  { "id": "559", "name": "Kentoya" },
  { "id": "234", "name": "Kikker 5150" },
  { "id": "235", "name": "Kinetic" },
  { "id": "236", "name": "Kinroad" },
  { "id": "542", "name": "Kollter" },
  { "id": "577", "name": "Kove" },
  { "id": "237", "name": "Kramit" },
  { "id": "238", "name": "KRC" },
  { "id": "239", "name": "Kreidler" },
  { "id": "240", "name": "KSR" },
  { "id": "241", "name": "KTM" },
  { "id": "516", "name": "Kuba" },
  { "id": "242", "name": "Kuberg" },
  { "id": "243", "name": "Kumpan" },
  { "id": "543", "name": "Kurazai" },
  { "id": "244", "name": "Kymco" },
  { "id": "245", "name": "Lambretta" },
  { "id": "550", "name": "Lance" },
  { "id": "246", "name": "Lauge Jensen" },
  { "id": "247", "name": "Laverda" },
  { "id": "248", "name": "Lectrix" },
  { "id": "249", "name": "Lehman Trikes" },
  { "id": "250", "name": "Lem" },
  { "id": "251", "name": "Leonart" },
  { "id": "252", "name": "Leonhardt" },
  { "id": "253", "name": "Lexmoto" },
  { "id": "254", "name": "Lifan" },
  { "id": "255", "name": "Lightning" },
  { "id": "256", "name": "Ligier" },
  { "id": "257", "name": "Linhai" },
  { "id": "258", "name": "Lintex" },
  { "id": "259", "name": "Lit Motors" },
  { "id": "260", "name": "Lito" },
  { "id": "551", "name": "LiveWire" },
  { "id": "261", "name": "LML" },
  { "id": "262", "name": "Lohia" },
  { "id": "263", "name": "Loncin" },
  { "id": "264", "name": "Longjia" },
  { "id": "265", "name": "LSL" },
  { "id": "567", "name": "Luojia" },
  { "id": "266", "name": "Luxxon" },
  { "id": "267", "name": "Macbor" },
  { "id": "268", "name": "Magni" },
  { "id": "269", "name": "Mahindra" },
  { "id": "270", "name": "Maico" },
  { "id": "562", "name": "Make" },
  { "id": "271", "name": "Malaguti" },
  { "id": "272", "name": "Malanca" },
  { "id": "273", "name": "Marine Turbine Technologies" },
  { "id": "274", "name": "Marks" },
  { "id": "275", "name": "Marsh" },
  { "id": "276", "name": "Mash" },
  { "id": "277", "name": "Matchless" },
  { "id": "278", "name": "Mavizen" },
  { "id": "279", "name": "MBK" },
  { "id": "280", "name": "MBS" },
  { "id": "281", "name": "Megelli" },
  { "id": "282", "name": "Metisse" },
  { "id": "283", "name": "MGB" },
  { "id": "284", "name": "MH" },
  { "id": "285", "name": "Midual" },
  { "id": "286", "name": "Mikilon" },
  { "id": "287", "name": "Millet" },
  { "id": "288", "name": "Mini" },
  { "id": "289", "name": "Minsk" },
  { "id": "290", "name": "Mission" },
  { "id": "545", "name": "Mitt" },
  { "id": "291", "name": "MM" },
  { "id": "292", "name": "Modenas" },
  { "id": "578", "name": "Mojo" },
  { "id": "293", "name": "Monark" },
  { "id": "294", "name": "Mondial" },
  { "id": "295", "name": "Montesa" },
  { "id": "296", "name": "Monto Motors" },
  { "id": "297", "name": "Moto Gima" },
  { "id": "298", "name": "Moto Guzzi" },
  { "id": "299", "name": "Moto Morini" },
  { "id": "300", "name": "Moto Union-OMV" },
  { "id": "301", "name": "Motobi" },
  { "id": "302", "name": "MotoCzysz" },
  { "id": "303", "name": "Motolevo" },
  { "id": "304", "name": "Motom" },
  { "id": "305", "name": "Motomel" },
  { "id": "546", "name": "Motoposh" },
  { "id": "306", "name": "Motorhispania" },
  { "id": "307", "name": "Motorino" },
  { "id": "308", "name": "Motors Europe" },
  { "id": "309", "name": "Mototrans" },
  { "id": "310", "name": "Motowell" },
  { "id": "579", "name": "Motron" },
  { "id": "311", "name": "Motus" },
  { "id": "315", "name": "Münch" },
  { "id": "312", "name": "Mustang" },
  { "id": "313", "name": "MuZ" },
  { "id": "314", "name": "MV Agusta" },
  { "id": "316", "name": "MZ" },
  { "id": "317", "name": "NCR" },
  { "id": "318", "name": "Neander" },
  { "id": "547", "name": "Neco" },
  { "id": "319", "name": "Nembo" },
  { "id": "320", "name": "Nimbus" },
  { "id": "321", "name": "Nipponia" },
  { "id": "322", "name": "Niu" },
  { "id": "323", "name": "Norton" },
  { "id": "324", "name": "NOX" },
  { "id": "325", "name": "NSU" },
  { "id": "326", "name": "Nuuk" },
  { "id": "327", "name": "Ohvale" },
  { "id": "328", "name": "Okinawa" },
  { "id": "580", "name": "Ola" },
  { "id": "329", "name": "Orcal" },
  { "id": "330", "name": "Orient" },
  { "id": "331", "name": "Orion" },
  { "id": "332", "name": "Oset" },
  { "id": "333", "name": "OSSA" },
  { "id": "334", "name": "Otto Bike" },
  { "id": "335", "name": "Over" },
  { "id": "336", "name": "Oxygen" },
  { "id": "337", "name": "Pagsta" },
  { "id": "338", "name": "Palmo" },
  { "id": "339", "name": "Pannonia" },
  { "id": "340", "name": "Panther" },
  { "id": "341", "name": "Paton" },
  { "id": "560", "name": "Peda" },
  { "id": "342", "name": "Penton" },
  { "id": "343", "name": "Peraves" },
  { "id": "344", "name": "Perks and Birch" },
  { "id": "345", "name": "Peugeot" },
  { "id": "346", "name": "PGO" },
  { "id": "347", "name": "Piaggio" },
  { "id": "348", "name": "Pierce" },
  { "id": "349", "name": "Pitster Pro" },
  { "id": "350", "name": "Polaris" },
  { "id": "351", "name": "Polini" },
  { "id": "352", "name": "Pope" },
  { "id": "353", "name": "Power Chief" },
  { "id": "354", "name": "Praga" },
  { "id": "355", "name": "PRC (Pro Racing Cycles)" },
  { "id": "356", "name": "Precision Cycle Works" },
  { "id": "357", "name": "Pro-One" },
  { "id": "358", "name": "proEco" },
  { "id": "359", "name": "Puch" },
  { "id": "360", "name": "Puma" },
  { "id": "361", "name": "Qingqi" },
  { "id": "517", "name": "QJmotor" },
  { "id": "362", "name": "Qlink" },
  { "id": "363", "name": "Qooder" },
  { "id": "364", "name": "Quadro" },
  { "id": "365", "name": "Quantya" },
  { "id": "366", "name": "Raleigh" },
  { "id": "367", "name": "Ravi Piaggio" },
  { "id": "518", "name": "Raybar " },
  { "id": "368", "name": "Reading Standard" },
  { "id": "369", "name": "Red Wing" },
  { "id": "370", "name": "Redneck" },
  { "id": "371", "name": "Revolt" },
  { "id": "372", "name": "Rewaco" },
  { "id": "583", "name": "RGNT" },
  { "id": "373", "name": "Rhino" },
  { "id": "374", "name": "Ridley" },
  { "id": "375", "name": "Rieju" },
  { "id": "376", "name": "Rikuo" },
  { "id": "377", "name": "Road Hopper" },
  { "id": "378", "name": "Rockford" },
  { "id": "379", "name": "Roehr" },
  { "id": "380", "name": "Rokon" },
  { "id": "381", "name": "Romet" },
  { "id": "382", "name": "Roxon" },
  { "id": "383", "name": "Royal Alloy" },
  { "id": "384", "name": "Rucker Performance" },
  { "id": "385", "name": "Rudge" },
  { "id": "568", "name": "Ryvid" },
  { "id": "386", "name": "Sachs" },
  { "id": "387", "name": "Samurai Chopper" },
  { "id": "388", "name": "Sanglas" },
  { "id": "552", "name": "Sanya" },
  { "id": "389", "name": "Sarolea" },
  { "id": "569", "name": "Savic" },
  { "id": "390", "name": "Saxon" },
  { "id": "548", "name": "Saxxx" },
  { "id": "391", "name": "Schickel" },
  { "id": "392", "name": "Schwinn" },
  { "id": "393", "name": "Scomadi" },
  { "id": "394", "name": "Scorpa" },
  { "id": "395", "name": "Scott" },
  { "id": "396", "name": "Sears" },
  { "id": "519", "name": "Seat" },
  { "id": "397", "name": "Senke" },
  { "id": "520", "name": "Serpento" },
  { "id": "398", "name": "Shanyang" },
  { "id": "582", "name": "Sharmax" },
  { "id": "399", "name": "Sherco" },
  { "id": "400", "name": "Shineray" },
  { "id": "401", "name": "ShineTime" },
  { "id": "402", "name": "Siamoto" },
  { "id": "521", "name": "Silence" },
  { "id": "403", "name": "Simplex" },
  { "id": "404", "name": "Simson" },
  { "id": "405", "name": "Sinnis" },
  { "id": "522", "name": "Skygo" },
  { "id": "406", "name": "Skyteam" },
  { "id": "407", "name": "Sommer" },
  { "id": "408", "name": "Sonik" },
  { "id": "409", "name": "Sora" },
  { "id": "523", "name": "Soriano" },
  { "id": "410", "name": "Sparta" },
  { "id": "411", "name": "Standbike" },
  { "id": "570", "name": "Stark" },
  { "id": "412", "name": "Starway-Chu Lan" },
  { "id": "544", "name": "Stealth" },
  { "id": "524", "name": "Stels" },
  { "id": "413", "name": "Sucker Punch Sallys" },
  { "id": "414", "name": "Sukida" },
  { "id": "415", "name": "Sunbeam" },
  { "id": "416", "name": "Sundiro" },
  { "id": "553", "name": "Super Gato" },
  { "id": "417", "name": "Super Motor" },
  { "id": "418", "name": "Super Soco" },
  { "id": "571", "name": "Surron" },
  { "id": "419", "name": "Suzuki" },
  { "id": "420", "name": "Suzuko" },
  { "id": "421", "name": "SVM" },
  { "id": "422", "name": "Swaygo" },
  { "id": "423", "name": "Swift" },
  { "id": "424", "name": "SWM" },
  { "id": "425", "name": "Sym" },
  { "id": "525", "name": "Tacita" },
  { "id": "426", "name": "Tank Sports" },
  { "id": "526", "name": "Tao Motor" },
  { "id": "427", "name": "Tauris" },
  { "id": "428", "name": "Tayo" },
  { "id": "429", "name": "Techo Electra" },
  { "id": "430", "name": "Terra Modena" },
  { "id": "431", "name": "TGB" },
  { "id": "432", "name": "Thumpstar" },
  { "id": "433", "name": "Tiger" },
  { "id": "434", "name": "Titan" },
  { "id": "435", "name": "TM Racing" },
  { "id": "436", "name": "Tohqi" },
  { "id": "437", "name": "Tomberlin" },
  { "id": "438", "name": "Tomos" },
  { "id": "439", "name": "Tork" },
  { "id": "440", "name": "Torrot" },
  { "id": "441", "name": "Track" },
  { "id": "442", "name": "Travertson" },
  { "id": "443", "name": "Triton" },
  { "id": "444", "name": "Triumph" },
  { "id": "445", "name": "Troll" },
  { "id": "446", "name": "TRS" },
  { "id": "447", "name": "TVS" },
  { "id": "448", "name": "Ultra" },
  { "id": "449", "name": "Ultra Motor" },
  { "id": "450", "name": "UM" },
  { "id": "451", "name": "Unu" },
  { "id": "452", "name": "Ural" },
  { "id": "453", "name": "Vahrenkamp" },
  { "id": "454", "name": "Valenti" },
  { "id": "455", "name": "Van Veen" },
  { "id": "527", "name": "Vastro" },
  { "id": "456", "name": "Vectrix" },
  { "id": "457", "name": "Veli" },
  { "id": "458", "name": "Velocette" },
  { "id": "561", "name": "Veloci" },
  { "id": "554", "name": "Velocifero" },
  { "id": "459", "name": "Vent" },
  { "id": "460", "name": "Vento" },
  { "id": "584", "name": "Verge" },
  { "id": "461", "name": "Vertemati" },
  { "id": "462", "name": "Vertigo" },
  { "id": "463", "name": "Vervemoto" },
  { "id": "464", "name": "Vespa" },
  { "id": "528", "name": "Viarelli" },
  { "id": "465", "name": "Vibgyor" },
  { "id": "466", "name": "Victoria" },
  { "id": "467", "name": "Victory" },
  { "id": "468", "name": "Vincent" },
  { "id": "469", "name": "Vincent HRD" },
  { "id": "470", "name": "Vins" },
  { "id": "471", "name": "Viper" },
  { "id": "472", "name": "Vmoto" },
  { "id": "529", "name": "Voge" },
  { "id": "530", "name": "Volta" },
  { "id": "473", "name": "Von Dutch" },
  { "id": "474", "name": "VOR" },
  { "id": "475", "name": "Voskhod" },
  { "id": "476", "name": "Voxan" },
  { "id": "477", "name": "Vuka" },
  { "id": "478", "name": "Vyrus" },
  { "id": "479", "name": "Wakan" },
  { "id": "480", "name": "Werner" },
  { "id": "481", "name": "West Coast Choppers" },
  { "id": "482", "name": "WK" },
  { "id": "483", "name": "WRM" },
  { "id": "484", "name": "WSK" },
  { "id": "485", "name": "WT Motors" },
  { "id": "486", "name": "Xingfu" },
  { "id": "487", "name": "Xingyue" },
  { "id": "488", "name": "Xispa" },
  { "id": "489", "name": "Xmotos" },
  { "id": "490", "name": "XOR" },
  { "id": "491", "name": "Yadea" },
  { "id": "492", "name": "Yale" },
  { "id": "493", "name": "Yamaha" },
  { "id": "572", "name": "Yamasaki" },
  { "id": "494", "name": "Yangtze" },
  { "id": "495", "name": "Yiben" },
  { "id": "496", "name": "YObykes" },
  { "id": "497", "name": "Yuki" },
  { "id": "498", "name": "Zanella" },
  { "id": "499", "name": "Zero" },
  { "id": "500", "name": "Zero Engineering" },
  { "id": "501", "name": "Zest" },
  { "id": "502", "name": "ZEV" },
  { "id": "503", "name": "Znen" },
  { "id": "504", "name": "Zongshen" },
  { "id": "505", "name": "Zontes" },
  { "id": "507", "name": "Zündapp" },
  { "id": "506", "name": "Zweirad-Union" }
];

// Provided categories JSON data
const CATEGORIES_DATA = [
  { "id": "1", "name": "Exhaust" },
  { "id": "2", "name": "Driveline" },
  { "id": "3", "name": "Carbon" },
  { "id": "4", "name": "Suspension" },
  { "id": "5", "name": "Chassis" },
  { "id": "6", "name": "Engine" },
  { "id": "7", "name": "Electronics" },
  { "id": "8", "name": "Accessories" },
  { "id": "9", "name": "Brake System" },
  { "id": "10", "name": "Wheels & Tires" },
  { "id": "11", "name": "Body Parts" },
  
];

// Famous brands to fetch models for (to respect rate limits)
const FAMOUS_BRANDS = [
  'Yamaha',
  'Honda',
  'Kawasaki',
  'Suzuki',
  'Ducati',
  'BMW',
  'KTM',
  'Harley-Davidson',
  'Triumph',
  'Aprilia',
  'MV Agusta',
  'Indian',
  'Moto Guzzi',
  'Benelli',
  'Husqvarna',
  'Royal Enfield',
  'Bajaj',
  'Hero',
  'TVS',
  'Kymco',
  'Piaggio',
];

// Helper function to make API requests
const makeApiRequest = (path) => {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      hostname: API_HOST,
      port: null,
      path: path,
      headers: {
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': API_HOST
      }
    };

    const req = https.request(options, (res) => {
      const chunks = [];

      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks);
          const bodyString = body.toString();
          
          // Check for HTTP errors
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${bodyString.substring(0, 200)}`));
            return;
          }

          // Try to parse JSON
          let data;
          try {
            data = JSON.parse(bodyString);
          } catch (parseError) {
            reject(new Error(`Failed to parse JSON response: ${parseError.message}. Response: ${bodyString.substring(0, 200)}`));
            return;
          }

          resolve(data);
        } catch (error) {
          reject(new Error(`Failed to process response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
};

// Helper function to delay between API calls to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to add a default admin user
const addAdminUser = async () => {
  console.log('Adding default admin user...');
  const email = 'admin@example.com';
  const plainPassword = 'password123'; // NOTE: Change this in a production environment!
  let hashedPassword;

  try {
    // Check if the user already exists
    const userCheck = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (userCheck.rows.length > 0) {
      console.log(`  ⚠ Admin user with email ${email} already exists. Skipping insertion.`);
      return;
    }
    
    // Hash the password (Requires a real hashing function like one using bcrypt)
    try {
      hashedPassword = await hashPassword(plainPassword);
    } catch (e) {
      console.error('  Error hashing password. Ensure `hashPassword` function is correctly implemented:', e.message);
      // For seeding purposes, if hashing fails, we'll stop to prevent inserting a plaintext password.
      // In a real scenario, the hashing utility should be robust.
      throw new Error('Password hashing failed.'); 
    }

    // Insert the admin user with a placeholder role (assuming a `role` column exists)
    await query(
      'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
      [email, hashedPassword, 'admin']
    );
    console.log(`  ✓ Default admin user inserted: ${email} (Password: ${plainPassword} - Hashed)`);

  } catch (error) {
    console.error('  ✗ Error inserting admin user:', error.message);
    throw error;
  }
};


const seed = async () => {
  try {
    console.log('Starting database seeding...');

    // Step 1: Clear existing data
    console.log('Clearing existing data...');
    // Note: Do not clear the 'users' table in this step if you want the admin user to persist 
    // across multiple structural data seeds. For a complete reset, uncomment the 'DELETE FROM users' line.
    await query('DELETE FROM models');
    await query('DELETE FROM parts WHERE brand_id IS NOT NULL');
    await query('DELETE FROM brands');
    await query('DELETE FROM categories');
    // await query('DELETE FROM users'); 
    console.log('Existing data cleared (excluding users).');

    // Step 2: Insert Makes (Brands) from provided JSON
    console.log(`Inserting ${MAKES_DATA.length} brands from provided data...`);
    const brandMap = {}; // Map API make ID to database brand ID

    for (const make of MAKES_DATA) {
      if (make.id && make.name) {
        try {
          await query(
            'INSERT INTO brands (name, api_make_id) VALUES (?, ?)',
            [make.name, parseInt(make.id)]
          );
          
          // Get the inserted brand ID
          const brandResult = await query(
            'SELECT id FROM brands WHERE api_make_id = ?',
            [parseInt(make.id)]
          );
          
          if (brandResult.rows.length > 0) {
            brandMap[make.id] = brandResult.rows[0].id;
          }
        } catch (error) {
          // Skip duplicates
          if (!error.message.includes('Duplicate entry') && !error.message.includes('ER_DUP_ENTRY')) {
            console.error(`Error inserting brand ${make.name}:`, error.message);
          }
        }
      }
    }
    console.log(`Inserted ${Object.keys(brandMap).length} brands.`);

    // Step 3: Insert Categories from provided JSON
    console.log(`Inserting ${CATEGORIES_DATA.length} categories from provided data...`);
    const categoryMap = {}; // Map API category ID to database category ID

    for (const category of CATEGORIES_DATA) {
      if (category.id && category.name) {
        try {
          await query(
            'INSERT INTO categories (name, api_category_id) VALUES (?, ?)',
            [category.name, parseInt(category.id)]
          );
          
          // Get the inserted category ID
          const categoryResult = await query(
            'SELECT id FROM categories WHERE api_category_id = ?',
            [parseInt(category.id)]
          );
          
          if (categoryResult.rows.length > 0) {
            categoryMap[category.id] = categoryResult.rows[0].id;
          }
        } catch (error) {
          // Skip duplicates
          if (!error.message.includes('Duplicate entry') && !error.message.includes('ER_DUP_ENTRY')) {
            console.error(`Error inserting category ${category.name}:`, error.message);
          }
        }
      }
    }
    console.log(`Inserted ${Object.keys(categoryMap).length} categories.`);

    // Step 4: Fetch and insert Models for famous brands only
    console.log('Fetching models for famous brands only...');
    let totalModels = 0;
    
    // Filter makes to only famous brands
    const famousMakes = MAKES_DATA.filter(make => 
      FAMOUS_BRANDS.includes(make.name)
    );

    console.log(`Processing ${famousMakes.length} famous brands...`);

    for (let i = 0; i < famousMakes.length; i++) {
      const make = famousMakes[i];
      if (!make.id || !make.name) continue;

      try {
        console.log(`Fetching models for ${make.name} (${i + 1}/${famousMakes.length})...`);
        
        // Fetch models by make name
        const modelsData = await makeApiRequest(`/model/make-name/${encodeURIComponent(make.name)}`);
        await delay(600); // Rate limiting delay (600ms between requests)

        // Debug: log what we received
        if (!modelsData) {
          console.log(`  ⚠ No data returned for ${make.name}`);
          continue;
        }

        // Check if it's an error response
        if (modelsData.error || modelsData.message) {
          console.log(`  ⚠ API Error for ${make.name}:`, modelsData.message || modelsData.error);
          continue;
        }

        // Check if it's an array
        if (!Array.isArray(modelsData)) {
          console.log(`  ⚠ Unexpected response format for ${make.name}. Type: ${typeof modelsData}, Value:`, JSON.stringify(modelsData).substring(0, 200));
          continue;
        }

        if (modelsData.length === 0) {
          console.log(`  ⚠ Empty array returned for ${make.name}`);
          continue;
        }

        const brandId = brandMap[make.id];
        if (!brandId) {
          console.log(`  Warning: Brand ID not found for ${make.name} (API ID: ${make.id})`);
          continue;
        }

        let modelsInserted = 0;
        let modelsSkipped = 0;
        for (const model of modelsData) {
          if (model.id && model.name) {
            try {
              await query(
                'INSERT INTO models (brand_id, name, api_model_id, api_make_id) VALUES (?, ?, ?, ?)',
                [brandId, model.name, parseInt(model.id), parseInt(make.id)]
              );
              modelsInserted++;
              totalModels++;
            } catch (error) {
              // Skip duplicate models
              if (error.message.includes('Duplicate entry') || error.message.includes('ER_DUP_ENTRY')) {
                modelsSkipped++;
              } else {
                console.error(`  Error inserting model ${model.name}:`, error.message);
              }
            }
          }
        }
        console.log(`  ✓ Inserted ${modelsInserted} models for ${make.name}${modelsSkipped > 0 ? ` (${modelsSkipped} duplicates skipped)` : ''}`);
      } catch (error) {
        console.error(`  ✗ Error fetching models for ${make.name}:`, error.message);
        if (error.stack) {
          console.error(`  Stack:`, error.stack.split('\n').slice(0, 3).join('\n'));
        }
        // Continue with next make
      }
    }
    
    // Step 5: Add a default administrative user
    await addAdminUser();

    console.log(`\nTotal models inserted: ${totalModels}`);

    console.log('\nDatabase seeding completed successfully!');
    console.log(`Summary:`);
    console.log(`  - Brands: ${Object.keys(brandMap).length}`);
    console.log(`  - Categories: ${Object.keys(categoryMap).length}`);
    console.log(`  - Models: ${totalModels} (from ${famousMakes.length} famous brands)`);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

// Run seeding if this file is executed directly
if (require.main === module) {
  seed()
    .then(() => {
      console.log('\nSeed process completed.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed process failed:', error);
      process.exit(1);
    });
}

module.exports = { seed };