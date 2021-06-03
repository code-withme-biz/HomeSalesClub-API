const streetAbbreviations: any = {
    'EAST':'E','WEST':'W', 'SOUTH':'S','NORTH':'N',
    'ALLEE': 'ALY', 'ALLEY': 'ALY', 'ALLY': 'ALY', 'ANEX': 'ANX', 'ANNEX': 'ANX', 'ANNX': 'ANX',
    'ARCADE': 'ARC', 'AVENUE': 'AVE', 'AV': 'AVE', 'AVEN': 'AVE', 'AVENU': 'AVE', 'AVN': 'AVE',
    'AVNUE': 'AVE', 'BAYOO': 'BYU', 'BAYOU': 'BYU', 'BEACH': 'BCH', 'BEND': 'BND', 'BLUFF': 'BLF',
    'BLUF': 'BLF', 'BLUFFS': 'BLFS', 'BOT': 'BTM', 'BOTTOM': 'BTM', 'BOTTM': 'BTM', 'BOULEVARD': 'BLVD',
    'BOUL': 'BLVD', 'BOULV': 'BLVD', 'BRANCH': 'BR', 'BRNCH': 'BR', 'BRIDGE': 'BRG', 'BRDGE': 'BRG',
    'BROOK': 'BRK', 'BROOKS': 'BRKS', 'BURG': 'BG', 'BURGS': 'BGS', 'BYPASS': 'BYP',
    'BYPA': 'BYP', 'BYPAS': 'BYP', 'BYPS': 'BYP', 'CAMP': 'CP', 'CMP': 'CP', 'CANYON': 'CYN',
    'CNYN': 'CYN', 'CAPE': 'CPE', 'CAUSEWAY': 'CSWY', 'CAUSWA': 'CSWY', 'CEN': 'CTR', 'CENTER': 'CTR',
    'CENT': 'CTR', 'CENTR': 'CTR', 'CENTRE': 'CTR', 'CNTER': 'CTR', 'CNTR': 'CTR', 'CENTERS': 'CTRS',
    'CIRC': 'CIR', 'CIRCL': 'CIR', 'CIRCLE': 'CIR', 'CRCL': 'CIR', 'CRCLE': 'CIR', 'CIRCLES': 'CIRS',
    'CLIFF': 'CLF', 'CLIFFS': 'CLFS', 'CLUB': 'CLB', 'COMMON': 'CMN', 'COMMONS': 'CMNS', 'CORNER': 'COR',
    'CORNERS': 'CORS', 'COURSE': 'CRSE', 'COURT': 'CT', 'COURTS': 'CTS', 'COVE': 'CV', 'COVES': 'CVS',
    'CREEK': 'CRK', 'CRESCENT': 'CRES', 'CRSENT': 'CRES', 'CRSNT': 'CRES', 'CREST': 'CRST',
    'CROSSING': 'XING', 'CRSSNG': 'XING', 'CROSSROAD': 'XRD', 'CROSSROADS': 'XRDS', 'CURVE': 'CURV',
    'DALE': 'DL', 'DAM': 'DM', 'DIVIDE': 'DV', 'DIV': 'DV', 'DVD': 'DV', 'DRIVE': 'DR', 'DRIV': 'DR',
    'DRV': 'DR', 'DRIVES': 'DRS', 'ESTATE': 'EST', 'ESTATES': 'ESTS', 'EXP': 'EXPY', 'EXPR': 'EXPY',
    'EXPRESS': 'EXPY', 'EXPRESSWAY': 'EXPY', 'EXPW': 'EXPY', 'EXTENSION': 'EXT', 'EXTN': 'EXT',
    'EXTNSN': 'EXT', 'EXTENSIONS': 'EXTS', 'FALLS': 'FLS', 'FERRY': 'FRY', 'FRRY': 'FRY', 'FIELD': 'FLD',
    'FIELDS': 'FLDS', 'FLAT': 'FLT', 'FLATS': 'FLTS', 'FORD': 'FRD', 'FORDS': 'FRDS', 'FOREST': 'FRST',
    'FORESTS': 'FRST', 'FORGE': 'FRG', 'FORG': 'FRG', 'FORGES': 'FRGS', 'FORK': 'FRK', 'FORKS': 'FRKS',
    'FORT': 'FT', 'FRT': 'FT', 'FREEWAY': 'FWY', 'FREEWY': 'FWY', 'FRWAY': 'FWY', 'FRWY': 'FWY',
    'GARDEN': 'GDN', 'GARDN': 'GDN', 'GRDEN': 'GDN', 'GRDN': 'GDN', 'GARDENS': 'GDNS', 'GDNS': 'GDNS',
    'GRDNS': 'GDNS', 'GATEWAY': 'GTWY', 'GATEWY': 'GTWY', 'GATWAY': 'GTWY', 'GTWAY': 'GTWY', 'GTWY': 'GTWY',
    'GLEN': 'GLN', 'GLENS': 'GLNS', 'GREEN': 'GRN', 'GREENS': 'GRNS', 'GROVE': 'GRV', 'GROV': 'GRV',
    'GROVES': 'GRVS', 'HARBOR': 'HBR', 'HARBR': 'HBR', 'HARB': 'HBR', 'HRBOR': 'HBR', 'HARBORS': 'HBRS',
    'HAVEN': 'HVN', 'HT': 'HTS', 'HIGHWAY': 'HWY', 'HIGHWY': 'HWY', 'HIWAY': 'HWY', 'HIWY': 'HWY',
    'HWAY': 'HWY', 'HILL': 'HL', 'HILLS': 'HLS', 'HLLW': 'HOLW', 'HOLLOW': 'HOLW', 'HOLLOWS': 'HOLW',
    'HOLWS': 'HOLW', 'ISLAND': 'IS', 'ISLND': 'IS', 'ISLANDS': 'ISS', 'ISLNDS': 'ISS', 'ISLES': 'ISLE',
    'JUNCTION': 'JCT', 'JCTION': 'JCT', 'JCTN': 'JCT', 'JUNCTN': 'JCT', 'JUNCTON': 'JCT', 'JUNCTIONS': 'JCTS',
    'JCTNS': 'JCTS', 'KEY': 'KY', 'KEYS': 'KYS', 'KNOLL': 'KNL', 'KNOL': 'KNL', 'KNOLLS': 'KNLS', 'LAKE': 'LK',
    'LAKES': 'LKS', 'LANDING': 'LNDG', 'LNDNG': 'LNDG', 'LANE': 'LN', 'LIGHT': 'LGT', 'LIGHTS': 'LGTS',
    'LOAF': 'LF', 'LOCK': 'LCK', 'LOCKS': 'LCKS', 'LODGE': 'LDG', 'LDGE': 'LDG', 'LODG': 'LDG', 'LOOPS': 'LOOP',
    'MANOR': 'MNR', 'MANORS': 'MNRS', 'MEADOW': 'MDW', 'MEADOWS': 'MDWS', 'MEDOWS': 'MDWS', 'MILL': 'ML',
    'MILLS': 'MLS', 'MISSN': 'MSSN', 'MSSN': 'MSSN', 'MOTORWAY': 'MTWY', 'MOUNT': 'MT', 'MNT': 'MT',
    'MOUNTAIN': 'MTN', 'MNTN': 'MTN', 'MNTAIN': 'MTN', 'MOUNTIN': 'MTN', 'MTIN': 'MTN', 'MOUNTAINS': 'MTNS',
    'NECK': 'NCK', 'ORCHARD': 'ORCH', 'ORCHRD': 'ORCH', 'OVL': 'OVAL', 'OVERPASS': 'OPAS', 'PRK': 'PARK',
    'PARKS': 'PARK', 'PARKWAY': 'PKWY', 'PARKWY': 'PKWY', 'PKWAY': 'PKWY', 'PKY': 'PKWY', 'PARKWAYS': 'PKWYS',
    'PASSAGE': 'PSGE', 'PATHS': 'PATH', 'PIKES': 'PIKE', 'PINE': 'PNE', 'PINES': 'PNES',
    'PLACE': 'PL', 'PLAIN': 'PLN', 'PLAINS': 'PLNS', 'PLAZA': 'PLZ', 'PLZA': 'PLZ', 'POINT': 'PT',
    'POINTS': 'PTS', 'PORT': 'PRT', 'PORTS': 'PRTS', 'PRAIRIE': 'PR', 'PRR': 'PR', 'RADIAL': 'RADL',
    'RADIEL': 'RADL', 'RAD': 'RADL', 'RANCH': 'RNCH', 'RANCHES': 'RNCH', 'RNCHS': 'RNCH', 'RAPID': 'RPD',
    'RAPIDS': 'RPDS', 'REST': 'RST', 'RIDGE': 'RDG', 'RDGE': 'RDG', 'RIDGES': 'RDGS', 'RIVER': 'RIV',
    'RVR': 'RIV', 'RIVR': 'RIV', 'ROAD': 'RD', 'ROADS': 'RDS', 'ROUTE': 'RTE', 'SHOAL': 'SHL',
    'SHOALS': 'SHLS', 'SHORE': 'SHR', 'SHOAR': 'SHR', 'SHORES': 'SHRS', 'SHOARS': 'SHRS', 'SKYWAY': 'SKWY',
    'SPRING': 'SPG', 'SPNG': 'SPG', 'SPRNG': 'SPG', 'SPRINGS': 'SPGS', 'SPNGS': 'SPGS', 'SPRNGS': 'SPGS',
    'SPURS': 'SPUR', 'SQUARE': 'SQ', 'SQR': 'SQ', 'SQRE': 'SQ', 'SQU': 'SQ', 'SQUARES': 'SQS',
    'SQRS': 'SQS', 'STATION': 'STA', 'STATN': 'STA', 'STN': 'STA', 'STRAVENUE': 'STRA', 'STRAV': 'STRA',
    'STRAVEN': 'STRA', 'STRAVN': 'STRA', 'STRVN': 'STRA', 'STRVNUE': 'STRA', 'STREAM': 'STRM', 'STREME': 'STRM',
    'STREET': 'ST', 'STRT': 'ST', 'STR': 'ST', 'STREETS': 'STS', 'SUMMIT': 'SMT', 'SUMIT': 'SMT',
    'SUMITT': 'SMT', 'TERRACE': 'TER', 'TERR': 'TER', 'THROUGHWAY': 'TRWY', 'TRACE': 'TRCE', 'TRACES': 'TRCE',
    'TRACK': 'TRAK', 'TRACKS': 'TRAK', 'TRK': 'TRAK', 'TRKS': 'TRAK', 'TRAFFICWAY': 'TRFY', 'TRAIL': 'TRL',
    'TRAILS': 'TRL', 'TRLS': 'TRL', 'TRAILER': 'TRLR', 'TRLRS': 'TRLR', 'TUNEL': 'TUNL', 'TUNNEL': 'TUNL',
    'TUNLS': 'TUNL', 'TUNNELS': 'TUNL', 'TUNNL': 'TUNL', 'TURNPIKE': 'TPKE', 'TURNPK': 'TPKE', 'TRNPK': 'TPKE',
    'UNDERPASS': 'UPAS', 'UNION': 'UN', 'UNIONS': 'UNS', 'VALLEY': 'VLY', 'VALLY': 'VLY', 'VLLY': 'VLY',
    'VALLEYS': 'VLYS', 'VIADUCT': 'VIA', 'VDCT': 'VIA', 'VIADCT': 'VIA', 'VIEW': 'VW', 'VIEWS': 'VWS',
    'VILLAGE': 'VLG', 'VILLAG': 'VLG', 'VILLG': 'VLG', 'VILLIAGE': 'VLG', 'VILL': 'VLG', 'VILLAGES': 'VLGS',
    'VILLE': 'VL', 'VISTA': 'VIS', 'VIST': 'VIS', 'VST': 'VIS', 'VSTA': 'VIS', 'WALKS': 'WALK', 'WY': 'WAY',
    'WELL': 'WL', 'WELLS': 'WLS'
}

exports.parsingDelimitedAddress = (fullAddress: string) => {
    try {
        if ((fullAddress.match(/\n/g)||[]).length > 1){
            fullAddress = fullAddress.replace(/^.*\n/, '')
            fullAddress.trim()
        }
        const splitedAddress = fullAddress.split('\n')
        const match = /^(.*?)\s*,\s*([A-Z]{2})\s*([\d\-]+)/.exec(splitedAddress![1])
        const normalizeZip = /^(\d{5})/.exec(match![3])![1]
        return {city: match![1], zip: normalizeZip, state: match![2]};
    } catch (e) {
        return {city: '', zip: '', state: ''};
    }
}

exports.comparisonAddresses = (mailAddress: any, propertyAddress: any) => {
    const addressRegex = new RegExp(normalizeAddress(propertyAddress), 'i')
    return addressRegex.test(normalizeAddress(mailAddress));
};

const normalizeAddress = (address: string|null) => {
    if (address) {
        const addressArray = address.split(' ')
        for (let i = 0; i <addressArray.length ; i++) {
            if (streetAbbreviations[addressArray[i].toUpperCase().trim()]) {
                addressArray[i] = streetAbbreviations[addressArray[i].toUpperCase()]
            }
        }
        return addressArray.join(" ")
    }
    return '';
}
exports.normalizeAddress = normalizeAddress

