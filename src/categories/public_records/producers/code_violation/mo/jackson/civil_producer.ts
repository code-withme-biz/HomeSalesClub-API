import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
import {countReset} from 'console';
import {log} from "util";

export default class CivilProducer extends AbstractProducer {

    sources = [
        { url: 'https://data.kcmo.org/resource/nhtf-e75a.json?status=Open', handler: this.handleSource, casetype: 'Property Violations' },
        { url: 'https://data.kcmo.org/resource/q6e8-cjhh.json?status=Open', handler: this.handleSource, casetype: 'Open Property Violations' },
        { url: 'https://data.kcmo.org/resource/jf4z-cm5s.json?status=Open', handler: this.handleSource, casetype: 'Open Code Violations' },
        {
            url: 'https://egcap.bluespringsgov.com/EnerGov_Prod/SelfService#/search?m=1&fm=5&ps=1000&pn=1&em=true',
            handler: this.handleSource1,
            casetype: ''
        }
    ];

    async init(): Promise<boolean> {
        console.log("running init")
        this.browser = await this.launchBrowser();
        this.browserPages.generalInfoPage = await this.browser.newPage();

        await this.setParamsForPage(this.browserPages.generalInfoPage);
        return true;
    };

    async read(): Promise<boolean> {
        return true;
    };


    async parseAndSave(): Promise<boolean> {
        let countRecords = 0;
        let page = this.browserPages.generalInfoPage;
        if (!page) return false;

        await page.setDefaultTimeout(60000);

        let sourceId = 0;
        for (const source of this.sources) {
            countRecords += await source.handler.call(this, page, source.url, sourceId, source.casetype);
            sourceId++;
        }

        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource(page: puppeteer.Page, url: string, sourceId: number, casetype: string) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime())),
            to: new Date()
        };
        let countRecords = 0;
        let limit = 1000;
        let offset = 0;

        while (true) {
            const response = await this.getCodeViolationData(url, limit, offset, 'violation_entry_date', dateRange.from, dateRange.to);
            if (response.success) {
                for (const record of response.data) {
                    const property_address = record.address;
                    const fillingdate = record.violation_entry_date;
                    const codeViolationId = (new Date(fillingdate)).getTime();

                    const res = {
                        property_address,
                        fillingdate,
                        casetype,
                        sourceId,
                        codeViolationId
                    }
                    if (await this.saveRecord(res))
                        countRecords++;
                }
                offset += limit;
                if (response.end) break;
                await this.sleep(this.getRandomInt(1000, 2000));
            } else {
                break;
            }
        }

        return countRecords;
    }

    async handleSource1(page: puppeteer.Page, url: string, sourceId: number, _: string) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true, (new Date('1/1/2020')).getTime())),
        };
        let countRecords = 0;
        let limit = 1000;
        let searchPage = 1;
        let nextPageSearch = true

        while (true) {
            const axiosData = {
                "Keyword": "",
                "ExactMatch": true,
                "SearchModule": 1,
                "FilterModule": 5,
                "SearchMainAddress": false,
                "PlanCriteria": {
                    "PlanNumber": null,
                    "PlanTypeId": null,
                    "PlanWorkclassId": null,
                    "PlanStatusId": null,
                    "ProjectName": null,
                    "ApplyDateFrom": null,
                    "ApplyDateTo": null,
                    "ExpireDateFrom": null,
                    "ExpireDateTo": null,
                    "CompleteDateFrom": null,
                    "CompleteDateTo": null,
                    "Address": null,
                    "Description": null,
                    "SearchMainAddress": false,
                    "ContactId": null,
                    "ParcelNumber": null,
                    "TypeId": null,
                    "WorkClassIds": null,
                    "ExcludeCases": null,
                    "PageNumber": 0,
                    "PageSize": 0,
                    "SortBy": null,
                    "SortAscending": false
                },
                "PermitCriteria": {
                    "PermitNumber": null,
                    "PermitTypeId": null,
                    "PermitWorkclassId": null,
                    "PermitStatusId": null,
                    "ProjectName": null,
                    "IssueDateFrom": null,
                    "IssueDateTo": null,
                    "Address": null,
                    "Description": null,
                    "ExpireDateFrom": null,
                    "ExpireDateTo": null,
                    "FinalDateFrom": null,
                    "FinalDateTo": null,
                    "ApplyDateFrom": null,
                    "ApplyDateTo": null,
                    "SearchMainAddress": false,
                    "ContactId": null,
                    "TypeId": null,
                    "WorkClassIds": null,
                    "ParcelNumber": null,
                    "ExcludeCases": null,
                    "PageNumber": 0,
                    "PageSize": 0,
                    "SortBy": null,
                    "SortAscending": false
                },
                "InspectionCriteria": {
                    "Keyword": null,
                    "ExactMatch": false,
                    "Complete": null,
                    "InspectionNumber": null,
                    "InspectionTypeId": null,
                    "InspectionStatusId": null,
                    "RequestDateFrom": null,
                    "RequestDateTo": null,
                    "ScheduleDateFrom": null,
                    "ScheduleDateTo": null,
                    "Address": null,
                    "SearchMainAddress": false,
                    "ContactId": null,
                    "TypeId": [],
                    "WorkClassIds": [],
                    "ParcelNumber": null,
                    "DisplayCodeInspections": false,
                    "ExcludeCases": [],
                    "ExcludeFilterModules": [],
                    "HiddenInspectionTypeIDs": null,
                    "PageNumber": 0,
                    "PageSize": 0,
                    "SortBy": null,
                    "SortAscending": false
                },
                "CodeCaseCriteria": {
                    "CodeCaseNumber": null,
                    "CodeCaseTypeId": null,
                    "CodeCaseStatusId": null,
                    "ProjectName": null,
                    "OpenedDateFrom": null,
                    "OpenedDateTo": null,
                    "ClosedDateFrom": null,
                    "ClosedDateTo": null,
                    "Address": null,
                    "ParcelNumber": null,
                    "Description": null,
                    "SearchMainAddress": false,
                    "RequestId": null,
                    "ExcludeCases": null,
                    "ContactId": null,
                    "PageNumber": 0,
                    "PageSize": 0,
                    "SortBy": "OpenedDate",
                    "SortAscending": false
                },
                "RequestCriteria": {
                    "RequestNumber": null,
                    "RequestTypeId": null,
                    "RequestStatusId": null,
                    "ProjectName": null,
                    "EnteredDateFrom": null,
                    "EnteredDateTo": null,
                    "DeadlineDateFrom": null,
                    "DeadlineDateTo": null,
                    "CompleteDateFrom": null,
                    "CompleteDateTo": null,
                    "Address": null,
                    "ParcelNumber": null,
                    "SearchMainAddress": false,
                    "PageNumber": 0,
                    "PageSize": 0,
                    "SortBy": null,
                    "SortAscending": false
                },
                "BusinessLicenseCriteria": {
                    "LicenseNumber": null,
                    "LicenseTypeId": null,
                    "LicenseClassId": null,
                    "LicenseStatusId": null,
                    "BusinessStatusId": null,
                    "LicenseYear": null,
                    "ApplicationDateFrom": null,
                    "ApplicationDateTo": null,
                    "IssueDateFrom": null,
                    "IssueDateTo": null,
                    "ExpirationDateFrom": null,
                    "ExpirationDateTo": null,
                    "SearchMainAddress": false,
                    "CompanyTypeId": null,
                    "CompanyName": null,
                    "BusinessTypeId": null,
                    "Description": null,
                    "CompanyOpenedDateFrom": null,
                    "CompanyOpenedDateTo": null,
                    "CompanyClosedDateFrom": null,
                    "CompanyClosedDateTo": null,
                    "LastAuditDateFrom": null,
                    "LastAuditDateTo": null,
                    "ParcelNumber": null,
                    "Address": null,
                    "TaxID": null,
                    "DBA": null,
                    "ExcludeCases": null,
                    "TypeId": null,
                    "WorkClassIds": null,
                    "ContactId": null,
                    "PageNumber": 0,
                    "PageSize": 0,
                    "SortBy": null,
                    "SortAscending": false
                },
                "ProfessionalLicenseCriteria": {
                    "LicenseNumber": null,
                    "HolderFirstName": null,
                    "HolderMiddleName": null,
                    "HolderLastName": null,
                    "HolderCompanyName": null,
                    "LicenseTypeId": null,
                    "LicenseClassId": null,
                    "LicenseStatusId": null,
                    "IssueDateFrom": null,
                    "IssueDateTo": null,
                    "ExpirationDateFrom": null,
                    "ExpirationDateTo": null,
                    "ApplicationDateFrom": null,
                    "ApplicationDateTo": null,
                    "Address": null,
                    "MainParcel": null,
                    "SearchMainAddress": false,
                    "ExcludeCases": null,
                    "TypeId": null,
                    "WorkClassIds": null,
                    "ContactId": null,
                    "PageNumber": 0,
                    "PageSize": 0,
                    "SortBy": null,
                    "SortAscending": false
                },
                "LicenseCriteria": {
                    "LicenseNumber": null,
                    "LicenseTypeId": null,
                    "LicenseClassId": null,
                    "LicenseStatusId": null,
                    "BusinessStatusId": null,
                    "ApplicationDateFrom": null,
                    "ApplicationDateTo": null,
                    "IssueDateFrom": null,
                    "IssueDateTo": null,
                    "ExpirationDateFrom": null,
                    "ExpirationDateTo": null,
                    "SearchMainAddress": false,
                    "CompanyTypeId": null,
                    "CompanyName": null,
                    "BusinessTypeId": null,
                    "Description": null,
                    "CompanyOpenedDateFrom": null,
                    "CompanyOpenedDateTo": null,
                    "CompanyClosedDateFrom": null,
                    "CompanyClosedDateTo": null,
                    "LastAuditDateFrom": null,
                    "LastAuditDateTo": null,
                    "ParcelNumber": null,
                    "Address": null,
                    "TaxID": null,
                    "DBA": null,
                    "ExcludeCases": null,
                    "TypeId": null,
                    "WorkClassIds": null,
                    "ContactId": null,
                    "HolderFirstName": null,
                    "HolderMiddleName": null,
                    "HolderLastName": null,
                    "MainParcel": null,
                    "PageNumber": 0,
                    "PageSize": 0,
                    "SortBy": null,
                    "SortAscending": false
                },
                "PlanSortList": [{"Key": "relevance", "Value": "Relevance"}, {
                    "Key": "PlanNumber.keyword",
                    "Value": "Plan Number"
                }, {"Key": "ProjectName.keyword", "Value": "Project"}, {
                    "Key": "MainAddress",
                    "Value": "Address"
                }, {"Key": "ApplyDate", "Value": "Apply Date"}],
                "PermitSortList": [{"Key": "relevance", "Value": "Relevance"}, {
                    "Key": "PermitNumber.keyword",
                    "Value": "Permit Number"
                }, {"Key": "ProjectName.keyword", "Value": "Project"}, {
                    "Key": "MainAddress",
                    "Value": "Address"
                }, {"Key": "IssueDate", "Value": "Issued Date"}, {"Key": "FinalDate", "Value": "Finalized Date"}],
                "InspectionSortList": [{"Key": "relevance", "Value": "Relevance"}, {
                    "Key": "InspectionNumber.keyword",
                    "Value": "Inspection Number"
                }, {"Key": "MainAddress", "Value": "Address"}, {
                    "Key": "ScheduledDate",
                    "Value": "Schedule Date"
                }, {"Key": "RequestDate", "Value": "Request Date"}],
                "CodeCaseSortList": [{"Key": "relevance", "Value": "Relevance"}, {
                    "Key": "CaseNumber.keyword",
                    "Value": "Code Case Number"
                }, {"Key": "ProjectName.keyword", "Value": "Project"}, {
                    "Key": "MainAddress",
                    "Value": "Address"
                }, {"Key": "OpenedDate", "Value": "Opened Date"}, {"Key": "ClosedDate", "Value": "Closed Date"}],
                "RequestSortList": [{"Key": "relevance", "Value": "Relevance"}, {
                    "Key": "RequestNumber.keyword",
                    "Value": "Request Number"
                }, {"Key": "ProjectName.keyword", "Value": "Project Name"}, {
                    "Key": "MainAddress",
                    "Value": "Address"
                }, {"Key": "EnteredDate", "Value": "Date Entered"}, {
                    "Key": "CompleteDate",
                    "Value": "Completion Date"
                }],
                "LicenseSortList": [{"Key": "relevance", "Value": "Relevance"}, {
                    "Key": "LicenseNumber.keyword",
                    "Value": "License Number"
                }, {"Key": "CompanyName.keyword", "Value": "Company Name"}, {
                    "Key": "AppliedDate",
                    "Value": "Applied Date"
                }, {"Key": "MainAddress", "Value": "Address"}],
                "ExcludeCases": null,
                "SortOrderList": [{"Key": true, "Value": "Ascending"}, {"Key": false, "Value": "Descending"}],
                "HiddenInspectionTypeIDs": null,
                "PageNumber": searchPage,
                "PageSize": limit,
                "SortBy": "OpenedDate",
                "SortAscending": false
            }
            const axiosConfig = {
                headers: {
                    "tenantId": "1",
                    "tenantName": "BlueSpringsMOProd",
                    "Tyler-Tenant-Culture": "en-US",
                    "Tyler-TenantUrl": "BlueSpringsMOProd",
                    "Content-Type": "application/json"
                }
            }

            const response = await axios.post('https://egcap.bluespringsgov.com/EnerGov_Prod/selfservice/api/energov/search/search', axiosData, axiosConfig)

            searchPage++
            for (const record of response.data.Result.EntityResults) {
                const recordDate = new Date(record.ApplyDate)
                if (recordDate<dateRange.from){
                    nextPageSearch = false
                    continue
                }
                const caseno = record.CaseNumber;
                const property_address = record.AddressDisplay;
                const fillingdate = record.ApplyDate;
                const codeViolationId = (new Date(fillingdate)).getTime();
                const casetype = record.CaseType
                const res = {
                    caseno,
                    property_address,
                    fillingdate,
                    casetype,
                    sourceId,
                    codeViolationId
                }
                if (await this.saveRecord(res))
                    countRecords++;
            }
            await this.sleep(this.getRandomInt(1000, 2000));
            if (!nextPageSearch){
                break
            }
        }

        return countRecords;
    }

    async saveRecord(record: any) {
        const data = {
            'Property State': this.publicRecordProducer.state,
            'County': this.publicRecordProducer.county,
            'Property Address': record.property_address,
            "vacancyProcessed": false,
            "productId": this.productId,
            "caseUniqueId": record.caseno,
            fillingDate: record.fillingdate,
            originalDocType: record.casetype,
            sourceId: record.sourceId,
            codeViolationId: record.codeViolationId
        };
        return await this.civilAndLienSaveToNewSchema(data);
    }
}