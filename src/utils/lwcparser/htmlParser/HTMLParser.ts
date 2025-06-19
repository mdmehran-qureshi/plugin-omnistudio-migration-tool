/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable no-console */
import * as fs from 'fs';
import { FileConstant } from '../fileutils/FileConstant';
import { Logger } from '../../logger';

const DEFAULT_NAMESPACE = 'c';

export class HTMLParser {
  html: string;
  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  constructor(htmlFilePath: string) {
    // Load the HTML file and initialize cheerio
    this.html = this.loadHTMLFromFile(htmlFilePath);
  }

  // Method to load HTML from a file
  private loadHTMLFromFile(filePath: string): string {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      console.error(`Error reading file from disk: ${error}`);
      throw error;
    }
  }

  // Method to replace custom tags
  public replaceTags(namespaceTag: string): Map<string, string> {
    const htmlContentMap = new Map<string, string>();
    htmlContentMap.set(FileConstant.BASE_CONTENT, this.html);
    // Use a regular expression to match <omnistudio-input> to </omnistudio-input>
    this.html = this.html
      .replace('<' + namespaceTag, '<' + DEFAULT_NAMESPACE)
      .replace('</' + namespaceTag, '</' + DEFAULT_NAMESPACE);

    htmlContentMap.set(FileConstant.MODIFIED_CONTENT, this.html);
    return htmlContentMap;
  }

  // Method to save modified HTML back to a file
  public saveToFile(outputFilePath: string, modifiedHtml: string): void {
    try {
      fs.writeFileSync(outputFilePath, modifiedHtml);
      Logger.info(`Modified HTML saved to ${outputFilePath}`);
    } catch (error) {
      Logger.error(`Error writing file to disk: ${error}`);
      throw error;
    }
  }

  // Optional: Method to get the modified HTML as a string
  public getModifiedHTML(): string {
    return this.html;
  }
}
