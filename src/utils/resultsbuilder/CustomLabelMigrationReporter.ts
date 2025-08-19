/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { OmnistudioOrgDetails } from '../orgUtils';
import { createFilterGroupParam, createRowDataParam } from '../reportGenerator/reportUtil';
import { ReportParam } from '../reportGenerator/reportInterfaces';

export interface CustomLabelMigrationData extends ReportParam {
  [key: string]: any;
}

export interface CustomLabelMigrationInfo {
  labelName: string;
  cloneStatus: string;
  localizationStatus: Record<string, string>;
  errors: string[];
  warnings: string[];
}

export class CustomLabelMigrationReporter {
  public static getCustomLabelMigrationData(
    customLabelMigrationInfos: CustomLabelMigrationInfo[],
    instanceUrl: string,
    omnistudioOrgDetails: OmnistudioOrgDetails,
    page = 1,
    pageSize = 1000
  ): CustomLabelMigrationData {
    // Sort labels by name for consistent ordering
    const sortedLabels = [...customLabelMigrationInfos].sort((a, b) => a.labelName.localeCompare(b.labelName));

    const totalLabels = sortedLabels.length;
    const totalPages = Math.ceil(totalLabels / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedLabels = sortedLabels.slice(startIndex, endIndex);

    // Create flattened data object
    const data: any = {
      title: 'Custom Labels Migration Report',
      heading: 'Custom Labels Migration Report',
      org: {
        name: omnistudioOrgDetails.orgDetails.Name,
        id: omnistudioOrgDetails.orgDetails.Id,
        namespace: omnistudioOrgDetails.packageDetails.namespace,
        dataModel: omnistudioOrgDetails.dataModel,
      },
      assessmentDate: new Date().toString(),
      total: totalLabels,
      filterGroups: [
        createFilterGroupParam('Filter by Clone Status', 'cloneStatus', ['created', 'duplicate', 'error']),
      ],
      rows: this.getRowsForReport(paginatedLabels),
      headerGroups: this.getHeaderGroupsForReport(),
      // Pagination data with hardcoded values to avoid template engine issues
      paginationCurrentPage: page,
      paginationTotalPages: totalPages,
      paginationPageSize: pageSize,
      paginationHasNextPage: page < totalPages,
      paginationHasPreviousPage: page > 1,
      // Hardcoded navigation links to avoid template engine issues
      paginationPreviousPageHref: page > 1 ? `Custom_Labels_Page_${page - 1}_of_${totalPages}.html` : '',
      paginationNextPageHref: page < totalPages ? `Custom_Labels_Page_${page + 1}_of_${totalPages}.html` : '',
      // Generate hardcoded page links for jump to page section
      ...this.generateHardcodedPageLinks(page, totalPages),
    };

    return data;
  }

  public static generateCustomTemplateForPage(page: number, totalPages: number): string {
    // Calculate the range of pages to show around current page
    const range = 2; // Show 2 pages on each side of current page
    const start = Math.max(2, page - range);
    const end = Math.min(totalPages - 1, page + range);

    const showFirstEllipsis = start > 2;
    const showLastEllipsis = end < totalPages - 1;

    // Generate hardcoded pagination HTML for this specific page
    const paginationHtml = `
      <!-- Pagination Navigation -->
      <div class="pagination-container" style="margin-top: 20px; text-align: center;">
        <div class="pagination-info" style="margin-bottom: 10px; color: #666;">
          Page ${page} of ${totalPages} (1000 items per page)
        </div>
        
        <div class="pagination-controls">
          ${
            page > 1
              ? `<a href="Custom_Labels_Page_${page - 1}_of_${totalPages}.html" class="pagination-btn" style="
            display: inline-block;
            padding: 8px 16px;
            margin: 0 5px;
            background-color: #0070d2;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
          ">&larr; Previous</a>`
              : ''
          }
          
          <span class="current-page" style="
            display: inline-block;
            padding: 8px 16px;
            margin: 0 5px;
            background-color: #f3f2f2;
            color: #333;
            border-radius: 4px;
            font-weight: bold;
          ">${page}</span>
          
          ${
            page < totalPages
              ? `<a href="Custom_Labels_Page_${page + 1}_of_${totalPages}.html" class="pagination-btn" style="
            display: inline-block;
            padding: 8px 16px;
            margin: 0 5px;
            background-color: #0070d2;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
          ">Next &rarr;</a>`
              : ''
          }
        </div>
        
        <div class="pagination-jump" style="margin-top: 10px;">
          <span style="color: #666; margin-right: 10px;">Jump to page:</span>
          
          <!-- Always show first page -->
          <a href="Custom_Labels_Page_1_of_${totalPages}.html" style="
            display: inline-block;
            padding: 4px 8px;
            margin: 0 2px;
            background-color: ${page === 1 ? '#0070d2' : '#f3f2f2'};
            color: ${page === 1 ? 'white' : '#333'};
            text-decoration: none;
            border-radius: 2px;
            font-size: 12px;
          ">1</a>
          
          <!-- Show ellipsis if needed -->
          ${showFirstEllipsis ? '<span style="color: #666; margin: 0 5px;">...</span>' : ''}
          
          <!-- Show pages around current page -->
          ${Array.from({ length: end - start + 1 }, (_, i) => start + i)
            .map(
              (pageNum) => `
            <a href="Custom_Labels_Page_${pageNum}_of_${totalPages}.html" style="
              display: inline-block;
              padding: 4px 8px;
              margin: 0 2px;
              background-color: ${pageNum === page ? '#0070d2' : '#f3f2f2'};
              color: ${pageNum === page ? 'white' : '#333'};
              text-decoration: none;
              border-radius: 2px;
              font-size: 12px;
            ">${pageNum}</a>
          `
            )
            .join('')}
          
          <!-- Show ellipsis if needed -->
          ${showLastEllipsis ? '<span style="color: #666; margin: 0 5px;">...</span>' : ''}
          
          <!-- Always show last page if different from first page -->
          ${
            totalPages > 1
              ? `<a href="Custom_Labels_Page_${totalPages}_of_${totalPages}.html" style="
            display: inline-block;
            padding: 4px 8px;
            margin: 0 2px;
            background-color: ${page === totalPages ? '#0070d2' : '#f3f2f2'};
            color: ${page === totalPages ? 'white' : '#333'};
            text-decoration: none;
            border-radius: 2px;
            font-size: 12px;
          ">${totalPages}</a>`
              : ''
          }
        </div>
      </div>
    `;

    return paginationHtml;
  }

  private static generateHardcodedPageLinks(currentPage: number, totalPages: number): { [key: string]: any } {
    const links: { [key: string]: any } = {};

    // Generate links for pages 1-5 (most common case)
    for (let i = 1; i <= Math.min(5, totalPages); i++) {
      links[`paginationPage${i}Href`] = `Custom_Labels_Page_${i}_of_${totalPages}.html`;
      links[`paginationPage${i}IsCurrent`] = i === currentPage;
    }

    // Generate links for pages around current page (if different from 1-5)
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);

    for (let i = start; i <= end; i++) {
      links[`paginationPage${i}Href`] = `Custom_Labels_Page_${i}_of_${totalPages}.html`;
      links[`paginationPage${i}IsCurrent`] = i === currentPage;
    }

    // Always include last page
    if (totalPages > 5) {
      links[`paginationPage${totalPages}Href`] = `Custom_Labels_Page_${totalPages}_of_${totalPages}.html`;
      links[`paginationPage${totalPages}IsCurrent`] = totalPages === currentPage;
    }

    return links;
  }

  private static getRowsForReport(customLabelMigrationInfos: CustomLabelMigrationInfo[]): any[] {
    const rows: any[] = [];
    let rowIndex = 0;

    customLabelMigrationInfos.forEach((info) => {
      const cloneStatusClass = info.cloneStatus === 'created' ? 'text-success' : 'text-error';

      // If no localizations, create one row with empty language
      if (!info.localizationStatus || Object.keys(info.localizationStatus).length === 0) {
        rows.push({
          rowId: `custom_label_${rowIndex++}`,
          data: [
            createRowDataParam('name', info.labelName, true, 1, 1, false),
            createRowDataParam(
              'cloneStatus',
              info.cloneStatus,
              false,
              1,
              1,
              false,
              undefined,
              undefined,
              cloneStatusClass
            ),
            createRowDataParam('language', '', false, 1, 1, false),
            createRowDataParam('localizationCloneStatus', '', false, 1, 1, false),
          ],
        });
      } else {
        // Create separate row for each language
        Object.entries(info.localizationStatus).forEach(([languageCode, status]) => {
          const localizationStatusClass =
            status === 'created' ? 'text-success' : status === 'duplicate' ? 'text-warning' : 'text-error';

          rows.push({
            rowId: `custom_label_${rowIndex++}`,
            data: [
              createRowDataParam('name', info.labelName, true, 1, 1, false),
              createRowDataParam(
                'cloneStatus',
                info.cloneStatus,
                false,
                1,
                1,
                false,
                undefined,
                undefined,
                cloneStatusClass
              ),
              createRowDataParam('language', languageCode, false, 1, 1, false),
              createRowDataParam(
                'localizationCloneStatus',
                status,
                false,
                1,
                1,
                false,
                undefined,
                undefined,
                localizationStatusClass
              ),
            ],
          });
        });
      }
    });

    return rows;
  }

  private static getHeaderGroupsForReport(): any[] {
    return [
      {
        header: [
          {
            name: 'Name',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Clone Status',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Language',
            colspan: 1,
            rowspan: 1,
          },
          {
            name: 'Localization Clone Status',
            colspan: 1,
            rowspan: 1,
          },
        ],
      },
    ];
  }
}
