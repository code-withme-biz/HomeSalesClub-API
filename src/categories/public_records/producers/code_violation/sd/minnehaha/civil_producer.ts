import puppeteer from 'puppeteer';
import db from '../../../../../../models/db';
import AbstractProducer from '../../abstract_producer';
import axios from 'axios';
import {countReset} from 'console';
import {log} from "util";

export default class CivilProducer extends AbstractProducer {

    sources = [
        {
            url: 'https://css.siouxfalls.org/api/energov/search/search',
            handler: this.handleSource1
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
            countRecords += await source.handler.call(this, page, source.url, sourceId);
            sourceId++;
        }
        await AbstractProducer.sendMessage(this.publicRecordProducer.state, this.publicRecordProducer.county ? this.publicRecordProducer.county : this.publicRecordProducer.city, countRecords, 'Code Violation');
        return true;
    }

    async handleSource1(page: puppeteer.Page, url: string, sourceId: number) {
        let dateRange = {
            from: new Date(await this.getPrevCodeViolationId(sourceId, true)),
        };
        let countRecords = 0;
        let limit = 1000;
        let searchPage = 1;
        let nextPageSearch = true


        const axiosData = {
            "Keyword": "",
            "ExactMatch": false,
            "SearchModule": 5,
            "FilterModule": 1,
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
                "PageNumber": 0,
                "PageSize": 0,
                "SortBy": null,
                "SortAscending": false
            },
            "CodeCaseCriteria": {
                "CodeCaseNumber": null,
                "CodeCaseTypeId": "none",
                "CodeCaseStatusId": "none",
                "ProjectName": null,
                "OpenedDateFrom": dateRange.from.toISOString(),
                "OpenedDateTo": (new Date()).toISOString(),
                "ClosedDateFrom": null,
                "ClosedDateTo": null,
                "Address": null,
                "ParcelNumber": null,
                "Description": null,
                "SearchMainAddress": false,
                "RequestId": null,
                "ExcludeCases": null,
                "ContactId": null,
                "PageNumber": 1,
                "PageSize": 1000,
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
            }, {"Key": "ProjectName.keyword", "Value": "Project"}, {"Key": "ApplyDate", "Value": "Apply Date"}],
            "PermitSortList": [{"Key": "relevance", "Value": "Relevance"}, {
                "Key": "PermitNumber.keyword",
                "Value": "Permit Number"
            }, {"Key": "ProjectName.keyword", "Value": "Project"}, {
                "Key": "IssueDate",
                "Value": "Issued Date"
            }, {"Key": "FinalDate", "Value": "Finalized Date"}],
            "InspectionSortList": [{"Key": "relevance", "Value": "Relevance"}, {
                "Key": "InspectionNumber.keyword",
                "Value": "Inspection Number"
            }, {"Key": "ScheduledDate", "Value": "Schedule Date"}, {"Key": "RequestDate", "Value": "Request Date"}],
            "CodeCaseSortList": [{"Key": "relevance", "Value": "Relevance"}, {
                "Key": "CaseNumber.keyword",
                "Value": "Code Case Number"
            }, {"Key": "ProjectName.keyword", "Value": "Project"}, {
                "Key": "OpenedDate",
                "Value": "Opened Date"
            }, {"Key": "ClosedDate", "Value": "Closed Date"}],
            "RequestSortList": [{"Key": "relevance", "Value": "Relevance"}, {
                "Key": "RequestNumber.keyword",
                "Value": "Request Number"
            }, {"Key": "ProjectName.keyword", "Value": "Project Name"}, {
                "Key": "EnteredDate",
                "Value": "Date Entered"
            }, {"Key": "CompleteDate", "Value": "Completion Date"}],
            "LicenseSortList": [{"Key": "relevance", "Value": "Relevance"}, {
                "Key": "LicenseNumber.keyword",
                "Value": "License Number"
            }, {"Key": "CompanyName.keyword", "Value": "Company Name"}, {
                "Key": "AppliedDate",
                "Value": "Applied Date"
            }],
            "ExcludeCases": null,
            "SortOrderList": [{"Key": true, "Value": "Ascending"}, {"Key": false, "Value": "Descending"}],
            "PageNumber": 1,
            "PageSize": 1000,
            "SortBy": "OpenedDate",
            "SortAscending": false
        }

        const axiosConfig = {
            headers: {
                "tenantId": "1",
                "tenantName": "SiouxFalls",
                "Tyler-Tenant-Culture": "en-US",
                "Tyler-TenantUrl": "SiouxFalls",
                "Content-Type": "application/json"
            }
        }

        const response = await axios.post('https://css.siouxfalls.org/api/energov/search/search', axiosData, axiosConfig)


        for (const record of response.data.Result.EntityResults) {
            const recordDate = new Date(record.ApplyDate)
            const caseno = record.CaseNumber;
            const property_address = record.AddressDisplay;
            const fillingdate = recordDate.toLocaleDateString('en-US', {
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            });
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