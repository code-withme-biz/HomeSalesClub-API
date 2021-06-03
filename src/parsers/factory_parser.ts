import { PracticeTypes, PracticeValue } from './interfaces_parser'
import db from '../models/db'

async function loadParser(parserFileName: string) {
  const { default: Parser } = await import(parserFileName)
  return Parser
}

export default class ParserFactory {
  public constructor() {}

  public async getParser(practiceType: PracticeValue, state: string, county: string) {
    const practiceFileName = Object.keys(PracticeTypes).find(key => PracticeTypes[key] === practiceType)
    if (!practiceFileName) {
      return null
    }

    const Parser = await loadParser(`./${state.toLowerCase()}/${county.toLowerCase()}/${practiceFileName}_parser`)

    let normalizedCounty = county.toLowerCase().replace(/[\-\.]/ig, ' ').replace(/[^A-Z\d\s]/ig, '').replace(/\s+/g, '-');
    let normalizedState = state.toUpperCase().replace(/[\-\.]/ig, ' ').replace(/[^A-Z\d\s]/ig, '').replace(/\s+/g, '-');
    const publicRecordProducer = null //await db.models.PublicRecordProducer.findOne({ source: 'civil', state: normalizedState, county: normalizedCounty});

    const productName = `/${state.toLowerCase()}/${county.toLowerCase()}/${practiceType}`
    const productId = await db.models.Product.findOne({name: productName}).exec()

    return new Parser(publicRecordProducer, productId)
  }
}