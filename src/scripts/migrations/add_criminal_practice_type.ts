require('dotenv').config();
import db from '../../models/db';
import { stateAbbreviatable } from '../../core/state_abbreviatable';

import { IProduct } from '../../models/product';

( async () => {
    const COUNTIES: any = {
        "AL": [
            "madison", 
            "lee",
            "montgomery",
            "baldwin",
            "calhoun",
            "chambers",
            "coffee",
            "dale", 
            "elmore", 
            "etowah", 
            "houston", 
            "jefferson", 
            "lauderdale", 
            "limestone", 
            "marshall", 
            "mobile", 
            "shelby", 
            "st-clair", 
            "tuscaloosa", 
            "walker"
        ],
        "AZ": [
            "pima", 
            "maricopa", 
            "coconino", 
            "cochise", 
            "graham", 
            "mohave", 
            "navajo", 
            "pinal", 
            "santa-cruz", 
            "yavapai", 
            "yuma"
        ],
        "FL": [
            "palm-beach",
            "miami-dade",
            "broward",
            "duval",
            "escambia",
            "hillsborough",
            "leon",
            "sarasota",
            "pinellas",
            "orange",
            "clay",
            "polk",
            "manatee",
            "alachua",
            "seminole",
            "bay",
            "brevard",
            "charlotte",
            "citrus",
            "collier",
            "columbia",
            "flagler",
            "hernando",
            "highlands",
            "indian-river",
            "lake",
            "lee",
            "marion",
            "martin",
            "monroe",
            "nassau",
            "okaloosa",
            "osceola",
            "pasco",
            "putnam",
            "santa-rosa",
            "st-johns",
            "st-lucie",
            "sumter",
            "volusia",
            "wakulla",
            "walton"
        ],
        "CO": [
            "el-paso",
            "denver",
            "larimer",
            "adams",
            "arapahoe",
            "boulder",
            "broomfield",
            "chaffee",
            "delta",
            "douglas",
            "eagle",
            "fremont",
            "garfield",
            "grand",
            "jefferson",
            "la-plata",
            "mesa",
            "morgan",
            "pueblo",
            "routt",
            "summit",
            "teller",
            "weld"
        ],
        "TN": [
            "knox",
            "cheatham",
            "davidson",
            "hickman",
            "shelby",
            "hamilton",
            "rutherford",
            "anderson",
            "bedford",
            "blount",
            "bradley",
            "campbell",
            "carroll",
            "carter",
            "claiborne",
            "coffee",
            "cumberland",
            "dekalb",
            "dickson",
            "dyer",
            "fayette",
            "franklin",
            "gibson",
            "giles",
            "greene",
            "hamblen",
            "hardin",
            "hawkins",
            "henry",
            "jefferson",
            "lawrence",
            "lincoln",
            "loudon",
            "macon",
            "madison",
            "marion",
            "marshall",
            "maury",
            "mcminn",
            "mcnairy",
            "monroe",
            "montgomery",
            "obion",
            "overton",
            "polk",
            "putnam",
            "rhea",
            "roane",
            "robertson",
            "scott",
            "sevier",
            "smith",
            "sullivan",
            "sumner",
            "tipton",
            "warren",
            "washington",
            "weakley",
            "white",
            "williamson",
            "wilson"
        ],
        "KS": [
            "wyandotte", 
            "doniphan", 
            "johnson", 
            "butler", 
            "sedgwick"
        ],
        "OK": [
            "oklahoma",
            "tulsa",
            "bryan",
            "canadian",
            "carter",
            "cherokee",
            "cleveland",
            "comanche",
            "creek",
            "garfield",
            "kay",
            "le-flore",
            "mcclain",
            "muskogee",
            "osage",
            "ottawa",
            "payne",
            "pittsburg",
            "pontotoc",
            "pottawatomie",
            "rogers",
            "wagoner",
            "washington"
        ],
        "NV": ["clark", "washoe", "carson-city", "churchill", "douglas", "elko", "lyon", "nye"],
        "NY": [
            "erie",
            "rensselaer",
            "albany",
            "bronx",
            "broome",
            "cayuga",
            "chemung",
            "clinton",
            "delaware",
            "dutchess",
            "fulton",
            "genesee",
            "jefferson",
            "kings",
            "livingston",
            "monroe",
            "montgomery",
            "nassau",
            "new-york",
            "niagara",
            "oneida",
            "onondaga",
            "ontario",
            "orange",
            "orleans",
            "putnam",
            "queens",
            "richmond",
            "rockland",
            "saratoga",
            "schenectady",
            "steuben",
            "suffolk",
            "sullivan",
            "ulster",
            "washington",
            "wayne",
            "westchester"
        ],
        "OH": [
            "cuyahoga",
            "franklin",
            "hamilton",
            "lucas",
            "allen",
            "ashtabula",
            "auglaize",
            "butler",
            "champaign",
            "clark",
            "clermont",
            "clinton",
            "columbiana",
            "coshocton",
            "crawford",
            "darke",
            "defiance",
            "delaware",
            "erie",
            "fairfield",
            "fayette",
            "gallia",
            "geauga",
            "greene",
            "guernsey",
            "hancock",
            "hardin",
            "hocking",
            "jackson",
            "knox",
            "lake",
            "licking",
            "logan",
            "lorain",
            "madison",
            "mahoning",
            "marion",
            "medina",
            "mercer",
            "miami",
            "montgomery",
            "morrow",
            "muskingum",
            "paulding",
            "pickaway",
            "pike",
            "portage",
            "preble",
            "richland",
            "ross",
            "sandusky",
            "scioto",
            "seneca",
            "stark",
            "summit",
            "trumbull",
            "tuscarawas",
            "union",
            "van-wert",
            "warren",
            "wayne",
            "wood"
        ],
        "TX": [
            "harris",
            "collin",
            "tarrant",
            "mclennan",
            "midland",
            "travis",
            "denton",
            "bexar",
            "dallas",
            "el-paso",
            "bastrop",
            "bell",
            "brazoria",
            "brazos",
            "burnet",
            "cameron",
            "chambers",
            "comal",
            "coryell",
            "ector",
            "ellis",
            "fort-bend",
            "galveston",
            "grayson",
            "gregg",
            "guadalupe",
            "hays",
            "henderson",
            "hidalgo",
            "hood",
            "hunt",
            "jefferson",
            "johnson",
            "kaufman",
            "liberty",
            "lubbock",
            "montgomery",
            "navarro",
            "nueces",
            "orange",
            "parker",
            "polk",
            "potter",
            "randall",
            "rockwall",
            "san-jacinto",
            "san-patricio",
            "smith",
            "taylor",
            "tom-green",
            "victoria",
            "webb",
            "williamson"
        ],
        "OR": [
            "jackson", 
            "lane", 
            "multnomah", 
            "clackamas", 
            "clatsop", 
            "columbia", 
            "coos", 
            "crook", 
            "deschutes", 
            "douglas", 
            "josephine", 
            "klamath", 
            "lincoln", 
            "linn", 
            "marion", 
            "polk", 
            "washington", 
            "yamhill"
        ],
        "PA": [
            "allegheny",
            "lancaster",
            "philadelphia",
            "adams",
            "beaver",
            "berks",
            "blair",
            "bucks",
            "butler",
            "cambria",
            "carbon",
            "centre",
            "chester",
            "clearfield",
            "columbia",
            "cumberland",
            "dauphin",
            "delaware",
            "erie",
            "fayette",
            "franklin",
            "lackawanna",
            "lawrence",
            "lebanon",
            "lehigh",
            "luzerne",
            "lycoming",
            "mercer",
            "monroe",
            "montgomery",
            "northampton",
            "northumberland",
            "pike",
            "washington",
            "wayne",
            "westmoreland",
            "york"
        ],
        "WA": [
            "king", 
            "whatcom", 
            "thurston",
            "spokane",
            "benton",
            "chelan",
            "clark",
            "cowlitz",
            "franklin",
            "grant",
            "grays-harbor",
            "island",
            "kitsap",
            "lewis",
            "mason",
            "pierce",
            "skagit",
            "snohomish",
            "walla-walla",
            "yakima"
        ],
        "NJ": [
            "hudson",
            "camden",
            "atlantic",
            "bergen",
            "burlington",
            "cape-may",
            "cumberland",
            "essex",
            "gloucester",
            "hunterdon",
            "mercer",
            "middlesex",
            "monmouth",
            "morris",
            "ocean",
            "passaic",
            "salem",
            "somerset",
            "sussex",
            "union",
            "warren"
        ],
        "SC": [
            "richland",
            "york",
            "charleston",
            "aiken",
            "anderson",
            "beaufort",
            "berkeley",
            "darlington",
            "dorchester",
            "edgefield",
            "florence",
            "georgetown",
            "greenville",
            "horry",
            "kershaw",
            "lancaster",
            "laurens",
            "lexington",
            "oconee",
            "orangeburg",
            "pickens",
            "spartanburg",
            "sumter"
        ],
        "GA": [
            "cobb",
            "hall",
            "chatham",
            "dekalb",
            "fulton",
            "clayton",
            "gwinnett",
            "baldwin",
            "barrow",
            "bartow",
            "ben-hill",
            "bibb",
            "bryan",
            "camden",
            "carroll",
            "catoosa",
            "cherokee",
            "clarke",
            "coffee",
            "colquitt",
            "columbia",
            "coweta",
            "dawson",
            "dougherty",
            "douglas",
            "effingham",
            "elbert",
            "emanuel",
            "fannin",
            "fayette",
            "floyd",
            "forsyth",
            "gilmer",
            "glynn",
            "gordon",
            "grady",
            "greene",
            "habersham",
            "haralson",
            "harris",
            "hart",
            "henry",
            "houston",
            "jackson",
            "laurens",
            "lee",
            "liberty",
            "long",
            "lowndes",
            "madison",
            "mcduffie",
            "mcintosh",
            "mitchell",
            "monroe",
            "morgan",
            "murray",
            "muscogee",
            "newton",
            "oconee",
            "paulding",
            "peach",
            "pickens",
            "pierce",
            "polk",
            "putnam",
            "richmond",
            "rockdale",
            "spalding",
            "stephens",
            "sumter",
            "tattnall",
            "telfair",
            "thomas",
            "tift",
            "towns",
            "troup",
            "union",
            "walker",
            "walton",
            "wayne",
            "white",
            "whitfield"
        ],
        "DC": [ "dc" ],
        "IA": [
            "johnson",
            "polk",
            "black-hawk",
            "cerro-gordo",
            "clinton",
            "dallas",
            "des-moines",
            "dubuque",
            "linn",
            "pottawattamie",
            "scott",
            "story",
            "warren",
            "webster",
            "woodbury"
        ],
        "ID": [
            "ada",
            "bannock",
            "bonner",
            "bonneville",
            "canyon",
            "elmore",
            "kootenai",
            "twin-falls"
        ],
        "IN": [
            "marion",
            "johnson",
            "allen",
            "bartholomew",
            "boone",
            "clark",
            "clinton",
            "dearborn",
            "decatur",
            "dekalb",
            "delaware",
            "elkhart",
            "floyd",
            "gibson",
            "grant",
            "hamilton",
            "hancock",
            "hendricks",
            "henry",
            "jackson",
            "kosciusko",
            "lake",
            "laporte",
            "lawrence",
            "madison",
            "marshall",
            "monroe",
            "montgomery",
            "morgan",
            "porter",
            "scott",
            "shelby",
            "st-joseph",
            "steuben",
            "tippecanoe",
            "vanderburgh",
            "vigo",
            "wabash",
            "warrick",
            "wayne",
            "wells"
        ],
        "KY": [
            "jefferson",
            "warren",
            "anderson",
            "boone",
            "boyle",
            "campbell",
            "christian",
            "fayette",
            "franklin",
            "greenup",
            "hardin",
            "henderson",
            "hopkins",
            "jessamine",
            "kenton",
            "madison",
            "nelson",
            "oldham",
            "scott",
            "shelby"
        ],
        "WI": [
            "milwaukee",
            "dane",
            "adams",
            "brown",
            "chippewa",
            "dodge",
            "door",
            "douglas",
            "eau-claire",
            "fond-du-lac",
            "grant",
            "jefferson",
            "juneau",
            "kenosha",
            "la-crosse",
            "manitowoc",
            "marathon",
            "marinette",
            "oneida",
            "outagamie",
            "ozaukee",
            "pierce",
            "polk",
            "racine",
            "rock",
            "sauk",
            "sheboygan",
            "st-croix",
            "vilas",
            "walworth",
            "washington",
            "waukesha",
            "waupaca",
            "winnebago",
            "wood"
        ],
        "MO": [
            "bates",
            "andrew",
            "lafayette",
            "st-louis",
            "jackson",
            "boone",
            "buchanan",
            "butler",
            "callaway",
            "cape-girardeau",
            "cass",
            "christian",
            "clay",
            "cole",
            "franklin",
            "greene",
            "jasper",
            "jefferson",
            "johnson",
            "lincoln",
            "platte",
            "st-charles",
            "stone",
            "taney",
            "webster"
        ],
        "NE": [
            "lancaster",
            "cass",
            "douglas",
            "hall",
            "platte",
            "sarpy"
        ],
        "VA": [
            "richmond",
            "albemarle",
            "alexandria",
            "arlington",
            "augusta",
            "caroline",
            "chesapeake",
            "chesterfield",
            "culpeper",
            "danville",
            "fairfax",
            "fauquier",
            "franklin",
            "frederick",
            "fredericksburg",
            "gloucester",
            "greene",
            "hampton",
            "hanover",
            "harrisonburg",
            "henrico",
            "henry",
            "james-city",
            "loudoun",
            "louisa",
            "manassas",
            "nelson",
            "newport-news",
            "norfolk",
            "orange",
            "pittsylvania",
            "portsmouth",
            "prince-william",
            "roanoke",
            "rockingham",
            "salem",
            "shenandoah",
            "spotsylvania",
            "stafford",
            "suffolk",
            "virginia-beach",
            "warren",
            "westmoreland",
            "winchester",
            "york"
        ],
        "CT": [
            "hartford",
            "new-haven",
            "fairfield",
            "litchfield",
            "middlesex",
            "new-london",
            "tolland",
            "windham"
        ],
        "IL": [
            "st-clair",
            "adams",
            "boone",
            "champaign",
            "cook",
            "dekalb",
            "dupage",
            "kane",
            "kankakee",
            "kendall",
            "lake",
            "lee",
            "macon",
            "madison",
            "mchenry",
            "mclean",
            "peoria",
            "rock-island",
            "sangamon",
            "tazewell",
            "vermilion",
            "whiteside",
            "will",
            "winnebago"
        ],
        "NC": [
            "gaston",
            "wake",
            "durham",
            "mecklenburg",
            "buncombe",
            "alamance",
            "brunswick",
            "burke",
            "cabarrus",
            "caldwell",
            "carteret",
            "catawba",
            "chatham",
            "cleveland",
            "craven",
            "dare",
            "davidson",
            "davie",
            "duplin",
            "edgecombe",
            "forsyth",
            "franklin",
            "granville",
            "guilford",
            "harnett",
            "haywood",
            "henderson",
            "hoke",
            "iredell",
            "johnston",
            "lee",
            "lincoln",
            "moore",
            "nash",
            "new-hanover",
            "onslow",
            "orange",
            "pender",
            "person",
            "pitt",
            "randolph",
            "rockingham",
            "rowan",
            "rutherford",
            "sampson",
            "stanly",
            "stokes",
            "surry",
            "union",
            "watauga",
            "wayne",
            "wilson"
        ],
        "ME": [
            "cumberland", 
            "kennebec", 
            "york"
        ],
        "NM": [
            "bernalillo", 
            "doa-ana", 
            "eddy", 
            "lea", 
            "lincoln", 
            "san-juan"],
        "UT": [
            "utah", 
            "salt-lake", 
            "box-elder", 
            "cache", 
            "davis", 
            "tooele", 
            "washington", 
            "weber"
        ],
        "MI": [
            "kent",
            "kalamazoo",
            "allegan",
            "barry",
            "bay",
            "berrien",
            "branch",
            "calhoun",
            "eaton",
            "emmet",
            "genesee",
            "ingham",
            "iosco",
            "jackson",
            "lapeer",
            "lenawee",
            "livingston",
            "macomb",
            "midland",
            "monroe",
            "muskegon",
            "oakland",
            "ottawa",
            "saginaw",
            "shiawassee",
            "st-clair",
            "tuscola",
            "van-buren",
            "washtenaw",
            "wayne"
        ],
        "LA": [
            "east-baton-rouge",
            "ascension",
            "bossier",
            "caddo",
            "calcasieu",
            "jefferson",
            "lafayette",
            "lafourche",
            "livingston",
            "orleans",
            "ouachita",
            "rapides",
            "st-bernard",
            "st-charles",
            "st-martin",
            "st-tammany",
            "tangipahoa",
            "terrebonne"
        ],
        "ND": [
            "burleigh", 
            "cass", 
            "ward", 
            "williams"
        ],
        "MN": [
            "ramsey", 
            "anoka", 
            "blue-earth", 
            "carver", 
            "clay", 
            "dakota", 
            "douglas", 
            "hennepin", 
            "isanti", 
            "mcleod", 
            "mower", 
            "olmsted", 
            "rice", 
            "scott", 
            "sherburne", 
            "st-louis", 
            "stearns", 
            "washington", 
            "winona", 
            "wright"
        ],
        "SD": [ "minnehaha" ],
        "MD": [
            "baltimore",
            "allegany",
            "anne-arundel",
            "calvert",
            "caroline",
            "carroll",
            "cecil",
            "charles",
            "dorchester",
            "frederick",
            "harford",
            "howard",
            "montgomery",
            "prince-georges",
            "queen-annes",
            "st-marys",
            "washington",
            "wicomico",
            "worcester"
        ],
        "NH": [
            "hillsborough", 
            "belknap", 
            "cheshire", 
            "grafton", 
            "merrimack", 
            "rockingham", 
            "strafford"
        ],
        "MA": [
            "suffolk", 
            "barnstable", 
            "berkshire", 
            "bristol", 
            "essex", 
            "hampden", 
            "hampshire", 
            "middlesex", 
            "norfolk", 
            "plymouth", 
            "worcester"
        ],
        "CA": [
            "butte",
            "fresno",
            "san-diego",
            "santa-barbara",
            "kern",
            "los-angeles",
            "napa",
            "alameda",
            "orange",
            "sacramento",
            "san-bernardino",
            "san-francisco",
            "san-joaquin",
            "sonoma",
            "stanislaus",
            "ventura",
            "solano",
            "santa-cruz",
            "santa-clara",
            "san-luis-obispo",
            "calaveras",
            "contra-costa",
            "el-dorado",
            "humboldt",
            "imperial",
            "kings",
            "lake",
            "madera",
            "marin",
            "mendocino",
            "merced",
            "monterey",
            "nevada",
            "placer",
            "riverside",
            "san-mateo",
            "shasta",
            "sutter",
            "tehama",
            "tulare",
            "yolo",
            "yuba"
        ],
        "AK": [ "anchorage" ],
        "AR": [
            "benton", 
            "craighead", 
            "crawford", 
            "crittenden", 
            "faulkner", 
            "garland", 
            "lonoke", 
            "pulaski", 
            "saline", 
            "sebastian", 
            "washington", 
            "white"
        ],
        "DE": [
            "kent", 
            "new-castle", 
            "sussex"],
        "HI": [
            "hawaii", 
            "honolulu", 
            "maui"
        ],
        "MS": [
            "desoto", 
            "forrest", 
            "harrison", 
            "jackson", 
            "lafayette", 
            "lamar", 
            "lowndes", 
            "madison"
        ],
        "MT": [
            "cascade", 
            "flathead", 
            "gallatin", 
            "missoula", 
            "yellowstone"
        ],
        "RI": [
            "bristol", 
            "kent", 
            "newport", 
            "providence", 
            "washington"
        ],
        "VT": [ "chittenden" ],
        "WV": [
            "jefferson", 
            "monongalia", 
            "wood"
        ],
        "WY": [
            "laramie", 
            "natrona"
        ]
    }

    const createCriminal = async () => {
        const practiceType = 'criminal';
        for (let state of Object.keys(COUNTIES)) {
            for (let county of COUNTIES[state]) {
                const name = `/${state.toLowerCase()}/${county}/${practiceType}`
                const category = await db.models.Category.findOne({ name: 'public_records' }).exec();
                const product = await db.models.Product.findOne({ name: name }).exec();

                if (!product) {
                    console.log('seeding ' + name);
                    await db.models.Product.create({
                        name: name,
                        categoryId: category._id
                    });
                }
            }
        }
    }

    console.log('Adding criminal practiceType');
    try {
        await createCriminal();
    } catch (error) {
        console.log(error);
    }
    console.log('Done');

    process.exit();
})();

    