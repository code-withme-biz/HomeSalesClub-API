import mongoose from 'mongoose';
import db from '../../../../models/db';
import LandgridRefreshScanner from './refresh_scanner';
import LandgridVacancyScanner from './vacancy_scanner';
import containerCalculator from './container_calculator';

(async () => {
    let refreshCheck = await new LandgridRefreshScanner().startParsing();
    console.log('Refresh check finished. Result: ' + refreshCheck);
    let vacancyScan = await new LandgridVacancyScanner().startParsing();
    console.log('Vacancy scan finished. Result: ' + vacancyScan);
    let containers = await containerCalculator();

    // ADD MESSAGING HERE:
    console.warn(`First process finished. ${containers.length} PRO accounts needed for second process.`)

    await mongoose.disconnect();
})();