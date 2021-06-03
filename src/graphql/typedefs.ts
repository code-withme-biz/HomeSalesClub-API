import fs from 'fs';
import glob from 'glob';

export default function typedefs() {
    return glob.sync('**/*.gql')
      .map(file => fs.readFileSync(file, 'utf8'))
      .join('\n');
}