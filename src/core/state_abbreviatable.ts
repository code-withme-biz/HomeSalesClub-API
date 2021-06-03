export const stateAbbreviatable = (stateName: string): string | undefined => {
    let abbr: string | undefined;
    
    switch(stateName) {
        case 'alabama':
          abbr = 'AL';
          break;
        case 'alaska':
          abbr = 'AK';
          break;
        case 'arizona':
          abbr = 'AZ';
          break;
        case 'arkansas':
          abbr = 'AR';
          break;
        case 'california':
          abbr = 'CA';
          break;
        case 'colorado':
          abbr = 'CO';
          break;
        case 'connecticut':
          abbr = 'CT';
          break;
        case 'delaware':
          abbr = 'DE';
          break;
        case 'florida':
          abbr = 'FL';
          break;
        case 'georgia':
          abbr = 'GA';
          break;
        case 'hawaii':
          abbr = 'HI';
          break;
        case 'idaho':
          abbr = 'ID';
          break;
        case 'illinois':
          abbr = 'IL';
          break;
        case 'indiana':
          abbr = 'IN';
          break;
        case 'iowa':
          abbr = 'IA';
          break;
        case 'kansas':
          abbr = 'KS';
          break;
        case 'kentucky':
          abbr = 'KY';
          break;
        case 'louisiana':
          abbr = 'LA';
          break;
        case 'maine':
          abbr = 'ME';
          break;
        case 'maryland':
          abbr = 'MD';
          break;
        case 'massachusetts':
          abbr = 'MA';
          break;
        case 'michigan':
          abbr = 'MI';
          break;
        case 'minnesota':
          abbr = 'MN';
          break;
        case 'mississippi':
          abbr = 'MS';
          break;
        case 'missouri':
          abbr = 'MO';
          break;
        case 'montana':
          abbr = 'MT';
          break;
        case 'nebraska':
          abbr = 'NE';
          break;
        case 'nevada':
          abbr = 'NV';
          break;
        case 'new-hampshire':
          abbr = 'NH';
          break;
        case 'new-jersey':
          abbr = 'NJ';
          break;
        case 'new-mexico':
          abbr = 'NM';
          break;
        case 'new-york':
          abbr = 'NY';
          break;
        case 'north-carolina':
          abbr = 'NC';
          break;
        case 'north-dakota':
          abbr = 'ND';
          break;
        case 'ohio':
          abbr = 'OH';
          break;
        case 'oklahoma':
          abbr = 'OK';
          break;
        case 'oregon':
          abbr = 'OR';
          break;
        case 'pennsylvania':
          abbr = 'PA';
          break;
        case 'rhode-island':
          abbr = 'RI';
          break;
        case 'south-carolina':
          abbr = 'SC';
          break;
        case 'south-dakota':
          abbr = 'SD';
          break;
        case 'tennessee':
          abbr = 'TN';
          break;
        case 'texas':
          abbr = 'TX';
          break;
        case 'utah':
          abbr = 'UT';
          break;
        case 'vermont':
          abbr = 'VT';
          break;
        case 'virginia':
          abbr = 'VA';
          break;
        case 'washington':
          abbr = 'WA';
          break;
        case 'west-virginia':
          abbr = 'WV';
          break;
        case 'wisconsin':
          abbr = 'WI';
          break;
        case 'wyoming':
          abbr = 'WY';
          break;
        case 'dc':
          abbr = 'DC';
          break;
    }

    return abbr;
};