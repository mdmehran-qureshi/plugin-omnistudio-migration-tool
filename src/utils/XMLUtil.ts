/*
 * Copyright (c) 2025, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

/**
 * XMLUtil provides XML parsing and building functionality using the xmldom library.
 *
 * This class handles:
 * - Parsing XML strings into JavaScript objects
 * - Building XML strings from JavaScript objects
 * - Configuring parser options for Salesforce metadata XML structures
 * - Handling arrays for specific FlexiPage elements
 */
export class XMLUtil {
  /** XML parser instance configured for Salesforce metadata */
  private parser: DOMParser;
  /** XML serializer instance configured for formatted output */
  private serializer: XMLSerializer;

  private alwaysArray: string[];

  private xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n';

  /**
   * Initializes the XMLUtil with configured parser and serializer instances.
   *
   * The parser is configured to:
   * - Parse XML strings into DOM Document objects
   * - Handle Salesforce metadata XML structures
   *
   * The serializer is configured to:
   * - Format output with proper indentation
   * - Preserve XML structure and attributes
   */
  public constructor(alwaysArray: string[] = []) {
    this.parser = new DOMParser();
    this.serializer = new XMLSerializer();
    this.alwaysArray = alwaysArray;
  }

  // Parse XML string to JSON
  public parse(xmlString: string): any {
    const doc = this.parser.parseFromString(xmlString, 'text/xml');
    return this.xmlToJson(doc.documentElement as any);
  }

  // Convert JSON object to XML
  public build(jsonObject: any, rootElement = 'root'): string {
    const doc = new DOMParser().parseFromString(`<${rootElement}></${rootElement}>`, 'text/xml');
    const rootNode = doc.documentElement;
    this.jsonToXml(jsonObject, rootNode as unknown as Node);
    return this.xmlHeader + this.prettyPrintXml(this.serializer.serializeToString(doc));
  }

  // Convert XML node to JSON
  private xmlToJson(node: Node): any {
    let obj: any = {};

    if (node.nodeType === 1) {
      // ELEMENT_NODE
      // Process attributes
      const element = node as Element;
      if (element.attributes.length > 0) {
        obj['@attributes'] = {};
        for (let i = 0; i < element.attributes.length; i++) {
          const attr = element.attributes.item(i);
          obj['@attributes'][attr.nodeName] = attr.nodeValue;
        }
      }
    }

    // Process children nodes
    if (node.hasChildNodes()) {
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        const nodeName = child.nodeName;

        if (typeof obj[nodeName] === 'undefined') {
          obj[nodeName] = this.xmlToJson(child);
        } else {
          if (Array.isArray(obj[nodeName])) {
            obj[nodeName].push(this.xmlToJson(child));
          } else {
            obj[nodeName] = [obj[nodeName], this.xmlToJson(child)];
          }
        }
      }
    }

    if (Array.isArray(obj['#text'])) {
      delete obj['#text'];
    }

    if (Object.keys(obj).includes('#text')) {
      obj = obj['#text'];
    }

    for (const key of Object.keys(obj)) {
      if (this.alwaysArray.includes(key) && !Array.isArray(obj[key])) {
        obj[key] = [obj[key]];
      }
    }

    // Process text content
    if (node.nodeType === 3) {
      // TEXT_NODE
      obj = node.nodeValue.trim();
    }

    return obj;
  }

  // Convert JSON object to XML nodes recursively
  private jsonToXml(jsonObject: any, parentNode: Node, arrayKey = ''): void {
    if (jsonObject === null || jsonObject === undefined) return;

    if (typeof jsonObject === 'object' && !Array.isArray(jsonObject)) {
      // Process attributes
      if (jsonObject['@attributes']) {
        const attributes = jsonObject['@attributes'];
        const element = parentNode as Element;
        for (const [attrName, attrValue] of Object.entries(attributes)) {
          element.setAttribute(attrName, attrValue as string);
        }
      }

      // Process children nodes
      for (const [key, value] of Object.entries(jsonObject)) {
        if (key === '@attributes') {
          continue;
        }
        if (Array.isArray(value)) {
          this.jsonToXml(value, parentNode, key);
          continue;
        }
        const childNode = parentNode.ownerDocument.createElement(key);
        parentNode.appendChild(childNode);
        this.jsonToXml(value, childNode);
      }
    } else if (Array.isArray(jsonObject)) {
      // If it's an array, we need to create multiple children
      for (const item of jsonObject) {
        const childNode = parentNode.ownerDocument.createElement(arrayKey);
        parentNode.appendChild(childNode);
        this.jsonToXml(item, childNode);
      }
    } else {
      // If it's just a text value
      const textNode = parentNode.ownerDocument.createTextNode(jsonObject as string);
      parentNode.appendChild(textNode);
    }
  }

  private prettyPrintXml(xmlString: string): string {
    let formatted = '';
    let indentLevel = 0;
    const regEx = /(>)(<)(\/*)/g;
    xmlString = xmlString.replace(regEx, '$1\r\n$2$3');

    const xmlArray = xmlString.split('\r\n');
    for (const xmlItem of xmlArray) {
      const line = xmlItem;

      // Decrease indent level for standalone closing tags before formatting
      if (/<\//.exec(line) && !/.*>.*<\//.exec(line)) {
        indentLevel--;
      }

      // Add the line with current indent level
      formatted += '    '.repeat(Math.max(0, indentLevel)) + line + '\r\n';

      // Increase indent level for opening tags (but not self-closing tags) after formatting
      if (/</.exec(line) && !/\/>/.exec(line) && !/<\//.exec(line)) {
        indentLevel++;
      }
    }

    return formatted.trim();
  }
}
