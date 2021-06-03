## TEMPORARY NOTES (11-6-2020):
Normalization to the db occurred. You must run the scripts in the migrations folder!

## HomeSalesClub API Objectives

HomeSalesClub is a factory service to capture data from public records. With the wealth of data at our fingertips, we perform statistical probability distribution calculations on the data to project changes in given industries.

## Installation
Note: You must have aws configure running.  
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 465464725359.dkr.ecr.us-east-1.amazonaws.com  

If you're using mac without Docker, xcode-select install must be run, brew install bcrypt is also required.

Docker required RAM: 4 GB

1. Copy environment variables from AWS account (System Manager's Parameter Store) in a .env file at root of project

2. Seed Database

```
$ npm run static_seed
```

3. Run Server via docker

```
$ docker-compose up
```

## SOME EXPLANATION ABOUT PRACTICE TYPES (05-04-2021)
- Eviction  
For eviction, we need the Plaintiff because they own the property. The tenant is living in it but they do not own it
- Probate  
In a probate case, that is the person who died.  
The person who died owns the property but since they are dead, the property is bequeathed to the offspring.  
So who does it get passed on to? It gets passed onto the petitioner  
They are petitioning for the property since the descendent has died.  
So in this case, the property of the descendent becomes the property address and the address of petitioner becomes mailing address  
- Traffic  
This practice type is about Traffic Infractions and Criminal Traffic. Criminal Traffic is a criminal offense and is more serious.  
Criminal Traffic is like driving drunk and without a license. Traffic Infraction is like going through a red light.  
We need to save the Defendant information (including the property information) for this
- Civil  
SC PIP </=$100 goes under personal-injury practice type, and save the plaintiff information.  
CC Equity >$15,000 - $30,000 save the plaintiff information  
Real Property/Mortgage Foreclosure $1 - $15,000 is preforeclosure  
CC Property Insurance Claims >$15,000 - $30,000 is insurance-claims  
CC Credit Card Debt > $8,000 - $15,000 is debt  
CC Credit Card Debt >$15,000 - $30,000 is debt  
Removal of Tenant Residential & Dmgs is eviction  
Removal of Tenant Non-Residential is eviction  
Removal of Tenant Non-Residential & Dmgs is eviction  
CC Equity </= $15,000 is civil  
Chapter 82 - Unlawful Detainer is eviction  
SC Property Insurance Claim > $500 - $2,500 is insurance-claims  
SC Damages is debt, we want pls  
CC Damages is debt, we want dfs  
all Small Claims + - Damages is debt  
In the case of Real Property/Mortgage Foreclosure $1 - $15,000, we want defs  
In the case of CC Credit Card Debt, we want defs  
In case of SC Property Insurance Claim, we want pls  
In case of SC Damages, we want pls  
In case of Removal of Tenant Residential & Dogs is eviction, we want pls  
In case of Chapter 82 - Unlawful Detainer is eviction, we want both pls and defs  
In case of CC Equity, we want defs  
CC Replevin >$15,000 - $30,000 is debt, we want defs  
Civil Restitution Lien is debt, store defs  
"XX Auto Recovery" is insurance-claim store defs  
Neg - Negligent Security is personal-injury, store defs  
Neg - Construction Defect is property-defect, store pls  
Trust Litigation is pre-inheritence, we want both pls and defs.  
Evictions < $15,000 is eviction practice type, we want pls.  
Medical Malpractice, Other Professional Malpractice is injury practice type, we want both dfs and pls.  

-  Criminal  
Store felony and misdemeanor cases as criminal, and save the defs


## Task Scheduler Overview

civil two run per minute at 6pm

{ source: 'civil' }
1039 

1039 / 2 = run two per minute (8 and half hours)
scrapetorium-civil-produce2-scheduled-task
cron(0/1 22-7 * * ? *)
npm,run,civil_produce

{ source: 'code-violation' }
1039

1039 / 2 = run two per minute (8 and half hours)
scrapetorium-code-violation-produce-scheduled-task
cron(0/1 22-7 * * ? *) 
npm,run,code_violation_producer

{ source: 'auctioncom' }
51

51 * 10 = run one every 10 minutes (8 and half hours)
scrapetorium-auctioncom-produce-scheduled-task
cron(0/10 22-7 * * ? *)
npm,run,auctioncom_produce

{ source: 'foreclosurecom' }
51

51 * 10 = run one every 10 minutes (8 and half hours)
scrapetorium-foreclosurecom-produce-scheduled-task
cron(0/10 22-7 * * ? *)
npm,run,foreclosurecom_produce

After 12 hours when the producer scripts started running, we reset the producer scripts:
reset_civil_producers (civil producer)
scrapetorium-reset-civil-producers-scheduled-task
cron(0 8 * * ? *)
npm,run,reset_civil_producers

reset_data_aggregator_producers (foreclosurecom and auctioncom producer)
reset-data-aggregator-producers-scheduled-task
cron(0 8 * * ? *)
npm,run,reset_data_aggregator_producers

scrapetorium-reset-code-violation-producers-scheduled-task (code violation producer)
scrapetorium-reset-code-violation-producers
cron(0 8 * * ? *)
npm,run,reset_code_violation_producers

After 12 hours from when the producer scripts started running, the PA scripts will run:
county_property_appraiser_consume

1039 / 2 = run two per minute (8 and half hours)
* Special note if California, then it will trigger the california script 
scrapetorium-county-property-appraiser-consume-scheduled-task
cron(0 8 * * ? *)
npm,run,county_property_appraiser_consume

After 18 hours, then the landgrid PA runs:
scrapetorium-landgrid-property-appraiser-consume-scheduled-task
cron(0 14 * * ? *)
npm,run,landgrid_property_appraiser_consume

After 19 hours:
reset_property_appraiser_consumers (reset county pa consumer)
scrapetorium-reset-property-appraiser-consumers-scheduled-task
cron(0 15 * * ? *)
npm,run,reset_property_appraiser_consumers

scrapetorium-reset-landgrid-pa-consumers-scheduled-task
reset-landgrid-pa-consumers (reset landgrid pa consumer)
scrapetorium-reset-landgrid-pa-consumers-scheduled-task
cron(0 15 * * ? *)


## Diagnosing Scripts

The PA consumer scripts are critical to fill in missing details. This is how to diagnose how effective landgrid consumer is:

1. Confirm script ran: 
// public_record_producers
{ source: 'civil', processed: true }

2. Given that Maricopa successfully ran, then search the product ids:
// products
db.products.find({ name: /^\/az\/maricopa/}).map( doc => doc._id )

3. Query owner_product_properties by those product ids:
// owner_product_properties
{ 
    landgridPropertyAppraiserProcessed: true,
    productId: { $in: [
    ObjectID("5f3fdfe25461f700251c7fae"),
    ObjectID("5f3fdfdf5461f700251c7fa2"),
    ...
    ]}
}

4. Now determine the success rate of the county:
// owner_product_properties
{
        landgridPropertyAppraiserProcessed: true,
        ownerId: { $ne: null },
        propertyId: { $ne: null },
        productId: {
          $in: [
            ObjectID("5f3fdfe25461f700251c7fae"),
            ObjectID("5f3fdfdf5461f700251c7fa2"),
            ...

904 (total owner_product_properties for maricopa from query in step 4)
DIVIDED BY
20583 (total owner_product_properties for maricopa from query in step 3)
ratio = 904 / 20583 * 100 = 4%

5. Isolate the problematic data:
{
    landgridPropertyAppraiserProcessed: true,
    ownerId: { $ne: null },
    propertyId: { $eq: null },
    productId: {
        $in: [
            ObjectID("5f3fdfe25461f700251c7fae"),
            ObjectID("5f3fdfdf5461f700251c7fa2"),
            ...

6. Take ownerId from owner_product_properties and then search by _id in owners collection:
// owners
{ _id: ObjectId('')}

7. Now check County Property Appraiser and compare it with Landgrid response to see why Landgrid was unable to find the match

## Chief Architect

Daniel Viglione
scrapetorium.com
'Statistics you can believe in'
  