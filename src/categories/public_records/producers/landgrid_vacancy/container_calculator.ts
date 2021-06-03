import db from '../../../../models/db';

import { config as CONFIG } from '../../../../config';
import { IConfigEnv } from '../../../../iconfig';
const config: IConfigEnv = CONFIG[process.env.NODE_ENV || 'production'];

const getRefreshDataDocuments = async () => {
    return (await db.models.LandgridCounty.find({ vacancy_records_processed: true, csv_download_processed: false }).exec());
}

const getAccountPoolDocuments = async () => {
    return (await db.models.LandgridAccount.find({ pro: true }).exec());
}

export default async () => {
    // Get vacancy documents array and sort it in descending order
    let vacancyDocs = await getRefreshDataDocuments();
    let accountPoolDocs = await getAccountPoolDocuments();
    vacancyDocs.sort((a, b) => b["vacancy_records"] - a["vacancy_records"]);

    let total = 0;

    // FFD bin-packing algorithm
    let containers: any = [];
    for (let vacancyDoc of vacancyDocs) {
        total += vacancyDoc["vacancy_records"];
        let added = false;

        if (vacancyDoc["vacancy_records"] == 0) continue;

        if (vacancyDoc["vacancy_records"] > 50000) {
            console.warn(`Vacancy number for ${vacancyDoc["normalized_state_name"]}/${vacancyDoc["normalized_county_name"]}: ${vacancyDoc["vacancy_records"]} > 50000!`);
            console.warn(`Will attempt to get list, but will be limited at 50,000 rows even if it works!`);
        }

        for (let container of containers) {
            if ((container.remainder - vacancyDoc["vacancy_records"]) > 0) {
                container['countyObjs'].push(vacancyDoc);
                container['remainder'] = container['remainder'] - vacancyDoc["vacancy_records"];
                added = true;
                break;
            }
        }

        if (!added) {
            containers.push({
                'countyObjs': [vacancyDoc],
                'remainder': 50000 - vacancyDoc["vacancy_records"]
            });
        }
    }

    if (containers.length > accountPoolDocs.length) {
        console.warn(containers.length - accountPoolDocs.length + ' more PRO accounts needed to download all CSVs.');
    }

    // //---------------- JUST FOR TESTING. TO BE REMOVED.
    // console.log(total);
    // console.log(`Number of PRO accounts needed: ${containers.length}\n`);

    // for (let i = 0; i < containers.length; i++) {
    //     console.log(`Container ${i + 1}:`);
    //     console.log(`No of items: ${containers[i].countyObjs.length}`);

    //     for (let j = 0; j < containers[i].countyObjs.length; j++) {
    //         console.log(`Item ${j + 1}: ${containers[i].countyObjs[j].normalized_state_name}/${containers[i].countyObjs[j].normalized_county_name} - ${containers[i].countyObjs[j].vacancy_records}`);
    //     }
    //     console.log(`Remainder: ${containers[i].remainder}`);
    //     console.log('\n');
    // }

    // console.log('\nDONE!')
    // //----------------- REMOVE UP TO HERE.
    return containers;
}