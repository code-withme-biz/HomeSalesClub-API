export const PracticeTypes: any = {
    foreclosure: 'foreclosure',
    preforeclosure: 'preforeclosure',
    bankrupcy: 'bankruptcy',
    tax_lien: 'tax-lien',
    auction: 'auction',
    child_support: 'child-support',
    inheritance: 'inheritance',
    probate: 'probate',
    eviction: 'eviction',
    hoa_lien: 'hoa-lien',
    irs_lien: 'irs-lien',
    enforce_lien: 'enforce-lien',
    mortgage_lien: 'mortgage-lien',
    preInheritance: 'pre-inheritance',
    pre_probate: 'pre-probate',
    divorce: 'divorce',
    tax_deliquency: 'tax-delinquency',
    code_violation: 'code-violation',
    absentee_property_owner: 'absentee-property-owner',
    vacancy: 'vacancy',
    criminal: 'criminal',
    perdonal_injury: 'personal-injury',
    marriage: 'marriage',
    civil: 'civil',
    traffic: 'traffic',
    debt: 'debt'
}

export type Practice = keyof typeof PracticeTypes
export type PracticeValue = typeof PracticeTypes[Practice]