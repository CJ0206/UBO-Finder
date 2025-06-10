(function() {
    // Define dataLayer and the gtag function if not already defined
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}

    // Set default consent to 'denied'
    gtag('consent', 'default', {
        'ad_storage': 'denied',
        'ad_user_data': 'denied',
        'ad_personalization': 'denied',
        'analytics_storage': 'denied',
        'wait_for_update': 500,
    });

    const BASE_URL = "https://[BASE_URL]/companies-house-api"; // NGINX proxy API
    const UK_JURISDICTIONS = ["england", "wales", "scotland", "united kingdom (scotland)", "united kingdom", "uinted kingdom", "united kingdom (england)", "united kingdom (wales)", "england & wales", "england and wales", "uk", "england-wales"];
    const MSG_LOADING = "<p>Loading...</p>";
    const MSG_COMPANY_NOT_FOUND_INITIAL = "<p>Error: Company not found.</p><p>Please check the company number.</p>";
    const MSG_INVALID_COMPANY_NUMBER_FORMAT = "<p>Invalid Company Number format. Please enter a 6 to 8-character alphanumeric company number.</p>";
    const OWNERSHIP_HEADER_PREFIX = "Ownership for Company: ";
    const STATUS_CEASED = "Ceased";
    const STATUS_ACTIVE = "Active";
    const INDIVIDUAL_PSC_IDENTIFIER = "N/A - Individual.";
    const NO_CH_NUMBER_IDENTIFIER = "N/A - No CH Number Returned.";
    const INVALID_CH_NUMBER_VIEW_LINK = "N/A - Invalid CH Number.";
    const OWNERSHIP_NOT_SPECIFIED = "Not Specified";
    const UNKNOWN_COMPANY_NAME = "Unknown Company";
    const UNKNOWN_JURISDICTION = "an unknown jurisdiction";
    const MSG_ERROR_404 = "<p>Error: Company not found (404). Please double-check the company number. If the number is correct and the error persists, the company may not be in the Companies House database or there might be an issue with the API service.</p>";
    const MSG_ERROR_429 = "<p>Error: Too many requests (429). You've exceeded the API request limit. Please wait for 5 minutes before trying again.</p>";
    const MSG_ERROR_FETCH = "<p>Error: Unable to fetch company information. Please check your connection or try again later.</p>";
    const MSG_ERROR_COMPANY_NOT_FOUND_GENERAL = "<p>The company could not be found.</p><p>Please note this form only works with company numbers.</p>";


    // Fetch basic company data (including name) for a company
    async function getCompanyInfo(companyNumber) {
        companyNumber = formatCompanyNumber(companyNumber);
        const url = `${BASE_URL}/company/${companyNumber}`;

        try {
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Accept": "application/json"
                }
            });

            if (!response.ok) {
                console.error("Error fetching company info:", response.status);
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error("Fetch error:", error);
            return null;
        }
    }

    // Fetch Persons with Significant Control (PSC) data for a company
    async function getPSC(companyNumber) {
        companyNumber = formatCompanyNumber(companyNumber);
        const url = `${BASE_URL}/company/${companyNumber}/persons-with-significant-control`;

        try {
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Accept": "application/json"
                }
            });

            if (!response.ok) {
                console.error("Error fetching PSC data:", response.status);
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error("Fetch error:", error);
            return null;
        }
    }

    // Helper function to extract and format the ownership percentage
    function getOwnershipPercentage(naturesOfControl) {
        if (!naturesOfControl || naturesOfControl.length === 0) return OWNERSHIP_NOT_SPECIFIED;

        // Regex to find patterns like "X-to-Y-percent" or "over-X-percent"
        // It captures the percentage range (e.g., "75-to-100", "over-50")
        const percentageRegex = /(?:ownership-of-shares-|voting-rights-)(over-\d+-percent|\d+-to-\d+-percent)/;

        for (let control of naturesOfControl) {
            const match = control.match(percentageRegex);
            if (match && match[1]) {
                let ownership = match[1].replace("-percent", ""); // Remove "-percent"
                ownership = ownership.replace(/-/g, " "); // Replace hyphens with spaces
                // Capitalize "over" if it exists
                if (ownership.startsWith("over ")) {
                    ownership = "Over" + ownership.substring(4);
                }
                return `${ownership}%`;
            }
        }
        return OWNERSHIP_NOT_SPECIFIED; // Return "Not Specified" if no matching control is found
    }

    // Ensure the company number is always 8 digits long
    function formatCompanyNumber(companyNumber) {
        // Capitalize the company number
        companyNumber = companyNumber.toUpperCase();

        // Only pad with zeros if length is 6 or more
        return companyNumber.length >= 6 ? companyNumber.padStart(8, '0') : companyNumber;
    }

    // Capitalize each word in a string
    function capitalizeWords(str) {
        if (!str) return '';
        return str.replace(/\b\w/g, char => char.toUpperCase());
    }

    // Function to search for a company and trace its ultimate ownership
    async function searchCompany() {
        let companyNumberInput = document.getElementById("companyNumber").value;
        let resultsDiv = document.getElementById("results");
        let companyNameDisplay = document.getElementById("companyNameDisplay");

        // Clear previous results and introduction
        resultsDiv.innerHTML = "";
        companyNameDisplay.innerHTML = "";

        // Validate company number format (6 to 8 chars)
        const companyNumberRegex = /^[a-zA-Z0-9]{6,8}$/;
        const cleanedCompanyNumberInput = companyNumberInput.replace(/\s/g, ""); // Clean spaces for validation

        if (!companyNumberRegex.test(cleanedCompanyNumberInput)) {
            resultsDiv.innerHTML = MSG_INVALID_COMPANY_NUMBER_FORMAT; // Use the constant for the updated message
            return;
        }
        
        // Format the company number using formatCompanyNumber immediately after validation
        let companyNumber = formatCompanyNumber(cleanedCompanyNumberInput);

        // Validate the company number input (Post-formatting) - formatCompanyNumber should always return a valid string
        if (!companyNumber) { // This check is more of a safeguard.
            resultsDiv.innerHTML = MSG_ERROR_COMPANY_NOT_FOUND_GENERAL; 
            return;
        }

        resultsDiv.innerHTML = MSG_LOADING; // Show loading message

        const companyInfo = await getCompanyInfo(companyNumber); // Fetch company information

        // Handle case where company information is not found
        if (!companyInfo) {
            resultsDiv.innerHTML = MSG_COMPANY_NOT_FOUND_INITIAL;
            return;
        }

        // Log all the data returned about the company
        console.log('Company Info:', companyInfo);

        const companyName = companyInfo.company_name || UNKNOWN_COMPANY_NAME;
        companyNameDisplay.innerHTML = `<p>Searching for company: ${companyName}</p>`;

        // Clear the "Loading..." message
        resultsDiv.innerHTML = "";

        // Start the recursive ownership tracing
        await findUltimateOwner(companyNumber, [], resultsDiv);

        const buttonContainerHTML = `
            <div id="buttonContainer">
                <button onclick="exportToCSV()">Export to CSV</button>
                <button onclick="exportToPDF()">Export to PDF</button>
            </div>
        `;
        resultsDiv.innerHTML += buttonContainerHTML;
    }

    // Recursively trace ownership
    async function findUltimateOwner(companyNumber, ownershipChain = [], resultsDiv) {
        // companyNumber parameter is already formatted by searchCompany or previous recursive call.
        // For clarity and safety, format again, especially if findUltimateOwner could be called from other places.
        const currentFormattedCompanyNumber = formatCompanyNumber(companyNumber); 
        console.log("Fetching PSC data for company:", currentFormattedCompanyNumber);

        // Fetch company information
        let companyInfo;
        try {
            // Pass currentFormattedCompanyNumber to getCompanyInfo.
            // getCompanyInfo itself also calls formatCompanyNumber, which is fine (idempotent).
            companyInfo = await getCompanyInfo(currentFormattedCompanyNumber);
            if (!companyInfo) { 
                // Simplified error handling: if no companyInfo, assume fetch error or not found.
                resultsDiv.innerHTML = MSG_ERROR_FETCH; 
                return;
            }
        } catch (error) { 
            console.error("Error fetching company info in findUltimateOwner:", error);
            resultsDiv.innerHTML = MSG_ERROR_FETCH;
            return;
        }
        // This check might be redundant if the try-catch handles !companyInfo, but kept for safety.
        if (!companyInfo) {
            resultsDiv.innerHTML = MSG_COMPANY_NOT_FOUND_INITIAL; 
            return;
        }
        
        const companyNameForDisplay = companyInfo.company_name || UNKNOWN_COMPANY_NAME;
        const companyLink = `<a href="https://find-and-update.company-information.service.gov.uk/company/${currentFormattedCompanyNumber}/persons-with-significant-control" target="_blank">${companyNameForDisplay}</a>`;
        
        // Pass currentFormattedCompanyNumber to getPSC.
        // getPSC itself also calls formatCompanyNumber.
        const pscData = await getPSC(currentFormattedCompanyNumber);

        // Create a new section to display company ownership data
        let companySection = document.createElement("div");
        companySection.innerHTML = `<br><h3>${OWNERSHIP_HEADER_PREFIX}${companyLink}</h3>`;
        resultsDiv.appendChild(companySection);

        if (!pscData || !pscData.items || pscData.items.length === 0) {
            let jurisdiction = companyInfo?.jurisdiction || UNKNOWN_JURISDICTION;
            jurisdiction = capitalizeWords(jurisdiction); // Capitalize each word in the jurisdiction
            companySection.innerHTML += `<br><h3>${companyNameForDisplay} is registered in ${jurisdiction}. No further PSC data is available.</h3>`;
            return ownershipChain;
        }

        let tableHTML = "<table border='1'><tr><th>Company Owner</th><th>Company Number</th><th>Ownership Percentage</th><th>Status</th><th>See on Companies House</th></tr>";
        let foreignEntityMessage = "";

        for (const psc of pscData.items) {
            console.log('Full PSC Data:', psc);

            let ownershipPercentage = getOwnershipPercentage(psc.natures_of_control);
            let legalAuthority = psc.identification?.country_registered ? psc.identification.country_registered.toLowerCase() : '';
            let rawRegistrationNumber = psc.identification?.registration_number || '';
            // Formatting for display or further processing of PSC registration numbers
            let registrationNumber = rawRegistrationNumber ? formatCompanyNumber(rawRegistrationNumber.toString()) : ''; 
            let companyNumberDisplay = registrationNumber ? registrationNumber : 'N/A';

            let viewLink = `<a href="https://find-and-update.company-information.service.gov.uk/company/${registrationNumber}/persons-with-significant-control" target="_blank">View on CH</a>`;
            let status = psc.ceased ? STATUS_CEASED : STATUS_ACTIVE;

            if (psc.ceased) {
                let ceasedDate = psc.ceased_on ? psc.ceased_on.split("-").reverse().join("/") : "Unknown Date";
                viewLink = `N/A - ${STATUS_CEASED} ${ceasedDate}`;
            } else if (legalAuthority && !UK_JURISDICTIONS.includes(legalAuthority)) {
                // For non-UK, display registration number as is (or with minimal formatting if needed), not CH format
                companyNumberDisplay = `${legalAuthority.toUpperCase()}: ${rawRegistrationNumber.toUpperCase()}`;
                console.log(`Non-UK entity detected: ${companyNumberDisplay}. Stopping recursion.`);
                legalAuthority = capitalizeWords(legalAuthority); // Capitalize each word in the legal authority
                foreignEntityMessage = `<br><h3>${psc.name} is registered in ${legalAuthority}. No further data is available.</h3>`;
                viewLink = "N/A";
            } else if (registrationNumber.length !== 8 && UK_JURISDICTIONS.includes(legalAuthority)) { // Only consider invalid if it's a UK entity
                viewLink = INVALID_CH_NUMBER_VIEW_LINK;
            }


            if (psc.kind === "individual-person-with-significant-control") {
                if (psc.ceased) {
                    let ceasedDate = psc.ceased_on ? psc.ceased_on.split("-").reverse().join("/") : "Unknown Date";
                    viewLink = `N/A - ${STATUS_CEASED} ${ceasedDate}`;
                } else {
                    viewLink = INDIVIDUAL_PSC_IDENTIFIER;
                }
            }

            if (psc.kind === "corporate-entity-person-with-significant-control" && !registrationNumber) {
                if (psc.ceased) {
                    let ceasedDate = psc.ceased_on ? psc.ceased_on.split("-").reverse().join("/") : "Unknown Date";
                    viewLink = `N/A - ${STATUS_CEASED} ${ceasedDate}`;
                } else {
                    viewLink = NO_CH_NUMBER_IDENTIFIER;
                }
            }

            let ownerInfo = {
                name: psc.name,
                type: psc.kind,
                notified_on: psc.notified_on,
                company_number: companyNumberDisplay || "N/A",
                ownership_percentage: ownershipPercentage,
                status: status
            };

            ownershipChain.push(ownerInfo); // Add owner information to the ownership chain

            tableHTML += `
                <tr>
                    <td>${ownerInfo.name}</td>
                    <td>${ownerInfo.company_number}</td>
                    <td>${ownerInfo.ownership_percentage}</td>
                    <td>${ownerInfo.status}</td>
                    <td>${viewLink}</td>
                </tr>
            `;

            // Recursively trace ownership for UK-based corporate entities
            if (!psc.ceased && registrationNumber && registrationNumber.length === 8 && psc.kind === "corporate-entity-person-with-significant-control" && UK_JURISDICTIONS.includes(legalAuthority)) {
                console.log("Recursively tracing ownership for company:", registrationNumber);
                await findUltimateOwner(registrationNumber, ownershipChain, resultsDiv);
            } else {
                console.log('No valid company number found for recursion or non-UK entity or individual.');
            }
        }
        tableHTML += "</table>"; // Close the table HTML
        companySection.innerHTML += tableHTML; // Add the table to the company section

        // Add foreign entity message if applicable
        if (foreignEntityMessage) {
            companySection.innerHTML += foreignEntityMessage;
        }

        return ownershipChain;
    }

    // Function to export results to .pdf
    async function exportToPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // --- Configuration Object ---
        const pdfConfig = {
            margin: 10,
            pageWidth: doc.internal.pageSize.width,
            get maxWidth() { return this.pageWidth - 2 * this.margin; }, // Dynamic property for max width
            title: {
                fontSize: 18,
                lineHeight: 10,
                startY: 20,
                spaceAfter: 0
            },
            table: {
                headFillColor: [0, 188, 212],
                headAlign: 'center',
                fontSize: 10,
                cellPadding: 3,
                overflow: 'linebreak',
                cellAlign: 'center',
                cellVAlign: 'middle',
                spacerRowHeight: 5,
                companySectionFillColor: [220, 220, 220],
                marginBottom: 30 // To prevent overlap with footer
            },
            footer: {
                fontSize: 10,
                text: "Searched using CJs Pi - UBO Finder",
                yPosition: doc.internal.pageSize.height - 10,
                dateTimeWidth: 60 // Estimated width for date/time string for right alignment
            },
            colors: {
                linkColor: [0, 102, 204],
                defaultText: [0, 0, 0],
                spacerFill: [255, 255, 255]
            },
            columns: ['Company Owner', 'Company Number', 'Ownership Percentage', 'Status', 'See on Companies House']
        };

        // --- Helper Functions ---

        /**
         * Adds the main title to the PDF document.
         * @param {jsPDF} docInstance - The jsPDF instance.
         * @param {string} titleText - The text for the title.
         * @param {object} config - The relevant title configuration.
         * @param {number}- The calculated start Y position for the next element.
         */
        function addTitle(docInstance, titleText, config) {
            docInstance.setFontSize(config.fontSize);
            const wrappedTitle = docInstance.splitTextToSize(titleText, pdfConfig.maxWidth);
            wrappedTitle.forEach((line, index) => {
                docInstance.text(line, pdfConfig.margin, config.startY + (index * config.lineHeight));
            });
            return config.startY + (wrappedTitle.length * config.lineHeight) + config.spaceAfter;
        }

        /**
         * Prepares the data for the main table by extracting it from the DOM.
         * @returns {Array} - An array of rows for the autoTable body.
         */
        function prepareTableData() {
            const tableRows = [];
            // Iterate through each company section (h3) and its corresponding table
            document.querySelectorAll("h3, table tr").forEach((row, rowIndex) => {
                if (row.tagName === "H3") {
                    // Add a spacer row if this is not the first company section
                    if (rowIndex !== 0) {
                        tableRows.push([{
                            content: '',
                            colSpan: pdfConfig.columns.length,
                            styles: { 
                                fillColor: [150, 150, 150], // Medium gray
                                minCellHeight: 1, 
                                cellPadding: 0 
                            }
                        }]);
                    }
                    // Add the company name as a styled header row
                    tableRows.push([{
                        content: row.textContent,
                        colSpan: pdfConfig.columns.length,
                        styles: {
                            fillColor: pdfConfig.table.companySectionFillColor,
                            fontStyle: 'bold',
                            halign: 'center',
                            valign: 'middle'
                        }
                    }]);
                } else { // This is a <tr> element
                    // Extract cell data (td or th)
                    const rowData = Array.from(row.querySelectorAll("td, th")).map((cell, colIndex) => {
                        // Special handling for the "See on Companies House" column for links
                        if (colIndex === 4) {
                            const linkElement = cell.querySelector("a");
                            const linkText = cell.textContent.trim();
                            const href = linkElement ? linkElement.getAttribute("href") : '';
                            return href ? { content: linkText, link: href } : { content: linkText };
                        }
                        return { content: cell.textContent.trim() };
                    });
                    if (rowData.length > 0) { // Ensure it's not an empty tr or just th row if already handled
                        tableRows.push(rowData);
                    }
                }
            });
            return tableRows;
        }
        
        /**
         * Draws the main table in the PDF.
         * @param {jsPDF} docInstance - The jsPDF instance.
         * @param {number} startY - The Y position to start drawing the table.
         * @param {Array} tableBodyData - The data for the table body.
         * @param {object} config - The PDF configuration object.
         */
        function drawTable(docInstance, startY, tableBodyData, config) {
            docInstance.autoTable({
                startY: startY,
                head: [config.columns],
                body: tableBodyData,
                theme: 'grid',
                showHead: 'never',
                headStyles: {
                    fillColor: config.table.headFillColor,
                    halign: config.table.headAlign
                },
                styles: {
                    fontSize: config.table.fontSize,
                    cellPadding: config.table.cellPadding,
                    overflow: config.table.overflow,
                    halign: config.table.cellAlign,
                    valign: config.table.cellVAlign
                },
                margin: { bottom: config.table.marginBottom, left: config.margin, right: config.margin },
                didParseCell: function(data) {
                    // Remove default text rendering if a link is present
                    if (data.cell.raw.link) {
                        data.cell.text = ''; 
                    }
                },
                didDrawCell: function(data) {
                    // Manually draw text with link for the "See on Companies House" column
                    if (data.column.index === 4 && data.cell.section === 'body' && data.cell.raw.link) {
                        docInstance.setTextColor(...config.colors.linkColor);
                        
                        const text = data.cell.raw.content;
                        const textWidth = docInstance.getTextWidth(text);
                        
                        // Calculate X for horizontal centering
                        const newX = data.cell.x + (data.cell.width - textWidth) / 2;
                        
                        // Calculate Y for vertical centering
                        // The base of the text will be at this Y.
                        // Adjusted the offset from (fontSize / 2.5) to (fontSize * 0.33)
                        const newY = data.cell.y + data.cell.height / 2 + (data.cell.styles.fontSize * 0.33); 

                        docInstance.textWithLink(
                            text,
                            newX,
                            newY,
                            { url: data.cell.raw.link }
                        );
                        docInstance.setTextColor(...config.colors.defaultText);
                    }
                },
                didDrawPage: function(data) {
                    // Add footer to each page using docInstance.internal.getNumberOfPages() for total pages.
                    addFooter(docInstance, data.pageNumber, docInstance.internal.getNumberOfPages(), config);
                }
            });
        }

        /**
         * Adds the footer to each page of the PDF.
         * @param {jsPDF} docInstance - The jsPDF instance.
         * @param {number} pageNumber - The current page number.
         * @param {number} totalPages - The total number of pages.
         * @param {object} config - The PDF configuration object.
         */
        function addFooter(docInstance, pageNumber, totalPages, config) { // totalPages param is no longer directly used from here due to placeholder
            docInstance.setFontSize(config.footer.fontSize);

            // Left-aligned footer text
            docInstance.text(config.footer.text, config.margin, config.footer.yPosition);

            // Right-aligned date and time
            const date = new Date();
            const formattedDate = date.toLocaleString("en-GB", { hour12: false });
            // Align to the right margin
            docInstance.text(formattedDate, config.pageWidth - config.margin, config.footer.yPosition, { align: 'right' });
            
            // Centered page number with placeholder for total pages
            docInstance.text(`${pageNumber} / {totalPages}`, config.pageWidth / 2, config.footer.yPosition, { align: 'center' });
        }

        // --- Main PDF Generation Flow ---

        // Retrieve initial company details for title and filename
        const firstCompanyHeader = document.querySelector("h3");
        const firstCompanyText = firstCompanyHeader ? firstCompanyHeader.textContent.replace(OWNERSHIP_HEADER_PREFIX, "") : "";
        const firstCompanyName = firstCompanyText.split(" - ")[0] || "CompanyData";
        const firstCompanyNumber = document.getElementById("companyNumber").value.toUpperCase();
        const currentDate = new Date().toISOString().split('T')[0].replace(/-/g, '');

        // 1. Add Title
        const titleText = `Company Ownership Data: ${firstCompanyName} (${firstCompanyNumber})`;
        let currentY = addTitle(doc, titleText, pdfConfig.title);

        // 2. Prepare Table Data
        const tableBody = prepareTableData();
        
        // 3. Draw Table (footer is drawn via didDrawPage callback in drawTable)
        drawTable(doc, currentY, tableBody, pdfConfig);

        // 4. Replace placeholder for total pages
        doc.putTotalPages('{totalPages}');

        // 5. Save PDF
        const filename = `Company Ownership Data - ${firstCompanyName} - ${firstCompanyNumber} - ${currentDate}.pdf`;
        doc.save(filename);
    }

    // Function to export results to .csv
    function exportToCSV() {
        let csvContent = "data:text/csv;charset=utf-8,";
        const firstCompanyHeader = document.querySelector("h3");
        const firstCompanyText = firstCompanyHeader ? firstCompanyHeader.textContent.replace("Ownership for Company: ", "") : "";
        const firstCompanyName = firstCompanyText.split(" - ")[0];
        const firstCompanyNumber = document.getElementById("companyNumber").value.toUpperCase();

        // Get the current date in YYYYMMDD format
        const currentDate = new Date().toISOString().split('T')[0].replace(/-/g, '');

        // Add the initial company ownership data header
        csvContent += `Company Ownership Data: ${firstCompanyName} ${firstCompanyNumber}\n\n`;

        let currentCompanyName = "";
        let addColumnTitles = false;
        document.querySelectorAll("h3, table tr").forEach(row => {
            if (row.tagName === "H3") {
                // Add company ownership header
                if (currentCompanyName !== "") {
                    csvContent += "\n"; // Add an extra empty line between companies
                }
                currentCompanyName = row.textContent.replace("Ownership for Company: ", "");
                csvContent += `${currentCompanyName}\n`;
                addColumnTitles = true; // Set flag to add column titles after company name
            } else if (row.querySelectorAll("td").length > 0) {
                // Add column headings above each company's result if there are results and if flag is set
                if (addColumnTitles) {
                    csvContent += "Company Owner,Company Number,Ownership Percentage,Status,See on Companies House\n";
                    addColumnTitles = false; // Reset flag after adding column titles
                }
                // Add table rows
                let rowData = Array.from(row.querySelectorAll("td")).map((cell, colIndex) => {
                    if (colIndex === 4) {
                        const linkElement = cell.querySelector("a");
                        return linkElement ? linkElement.getAttribute("href") : cell.textContent;
                    } else {
                        return cell.textContent;
                    }
                }).join(",");
                csvContent += `${rowData}\n`;
            } else if (row.tagName === "P") {
                // Add any additional text like "No further data is available" to the CSV
                let additionalText = row.textContent.trim();
                if (additionalText) {
                    csvContent += `${additionalText}\n`;
                }
            }
        });

        let encodedUri = encodeURI(csvContent);
        let link = document.createElement("a");
        const filename = `Company Ownership Data - ${firstCompanyName} ${firstCompanyNumber} - ${currentDate}.csv`;
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Function to reset the form and displayed results
    function resetForm() {
        console.clear(); // Clear the console
        document.getElementById("companyNumber").value = "";
        document.getElementById("results").innerHTML = "";
        document.getElementById("companyNameDisplay").innerHTML = "";

        // Restore the introduction blurb
        document.getElementById("results").innerHTML = `
            <div id="intro">
               <p>We harness the power of the UK Companies House API to reveal the Ultimate Beneficial Owner (UBO) and Persons of Significant Control (PSC) connected to any company registered with UK Companies House.</p>
                <p>To get started, simply enter an 8-character company number in the input box above and click <i>Search</i>. Our robust recursive search explores parent companies until it identifies an individual, follows offshore connections, or determines that no UBO/PSC is available.</p>
                <p>The results will display each active company's ownership structure, including controlling entities and individuals, their ownership percentages, and statuses (Active or Ceased).</p>
                <p>If no PSC data is available, a link to the company's profile on Companies House will be provided.</p>
                <p>You can export the retrieved data to a .csv or .pdf for future records, just click the relevant buttons once your results have loaded. Please note that cells are comma separated, so any names containing a comma on the page may result in an undesired output.</p>
                <hr>
                <p>Please note that if a missing company number is returned, the search will terminate and display the results obtained up to that point. You may need to check Companies House and rerun the search for the last entity found once you have obtained its complete UK company number.</p>
            </div>
        `;
    }

    // Function to hide cookie banner once accepted/declined - these are called by DOMContentLoaded listener
    function acceptCookies() {
        var cookieBanner = document.getElementById("cookie-banner");
        if (cookieBanner) {
            cookieBanner.style.display = "none";
        } else {
            console.log("Cookie banner not found when trying to accept.");
        }
    }

    function declineCookies() {
        var cookieBanner = document.getElementById("cookie-banner");
        if (cookieBanner) {
            cookieBanner.style.display = "none";
        } else {
            console.log("Cookie banner not found when trying to decline.");
        }
    }
    
 // Function to read patch notes
    function patchNotes() {
        console.clear(); // Clear the console
        // Check if the elements exist before modifying them
        const companyNumber = document.getElementById("companyNumber");
        const results = document.getElementById("results");
        const companyNameDisplay = document.getElementById("companyNameDisplay");

        if (companyNumber) companyNumber.value = "";
        if (results) results.innerHTML = "";
        if (companyNameDisplay) companyNameDisplay.innerHTML = "";

        if (results) {
            results.innerHTML = `
                <div id="intro">
                    <p>Please find a list of the latest patches below:</p>
                    <table>
                        <tr>
                            <th>Patch</th>
                            <th> </th>
                            <th>Changes</th>
                        </tr>
                        <tr>
                            <td>1.0.0</td>
                            <td> </td>
                            <td>
                                <ul>
                                    <li>Make the console show all of the PSC data returned.</li>
                                    <li>Remove any blank spaces from the company number before sending to API.</li>
                                    <li>Return CH link for corporate PSCs.</li>
                                    <li>Return no CH link for individual PSCs.</li>
                                    <li>Pad company number with 0's if < 8.</li>
                                    <li>Handle "Loading.." not being removed.</li>
                                    <li>List company name of PSCs instead of company numbers.</li>
                                    <li>Ensure active/ceased status is listed.</li>
                                    <li>Ensure ceased entities are not recursively searched.</li>
                                    <li>Expand UK definition.</li>
                                </ul>
                            </td>
                        </tr>
                        <tr>
                            <td>1.1.0</td>
                            <td> </td>
                            <td>
                                <ul>
                                    <li>Handle 429 error from API.</li>
                                    <li>Handle 404 error from API.</li>
                                    <li>Handle no CH number returned.</li>
                                    <li>Handle invalid CH number.</li>
                                    <li>Handle foreign overseas entities.</li>
                                    <li>Expand UK definition.</li>
                                    <li>Add reset button.</li>
                                </ul>
                            </td>
                        </tr>
                        <tr>
                            <td>1.1.1</td>
                            <td> </td>
                            <td>
                                <ul>
                                    <li>Handle "percent-registered-overseas-entity" to only return %.</li>
                                    <li>Handle "percent-limited-liability-partnership" to only return %.</li>
                                    <li>Handle "percent-or-more-as-a-member-of-a-firm" to only return %.</li>
                                    <li>Handle "percent-as-trust" to only return %.</li>
                                    <li>Handle companies incorporated by royal charter.</li>
                                    <li>Expand UK definition.</li>
                                </ul>
                            </td>
                        </tr>
                        <tr>
                            <td>1.1.2</td>
                            <td> </td>
                            <td>
                                <ul>
                                    <li>Handle when CH returns FCA number (i.e. registration number >= 6).</li>
                                    <li>Added space before <a href="https://ko-fi.com/A0A7SV8LO"><i>Buy me a coffee</i></a> link.
                                    <li>Animate <a href="https://ko-fi.com/A0A7SV8LO"><i>Buy me a coffee</i></a> link.</li>
                                </ul>
                            </td>
                        </tr>
                        <tr>
                            <td>1.1.3</td>
                            <td> </td>
                            <td>
                                <ul>
                                    <li>Added Patch table.</li>
                                    <li>Updated intro.</li>
                                    <li>Added Google analytics.</li>
                                </ul>
                            </td>
                        </tr>
                        <tr>
                            <td>1.2.0</td>
                            <td> </td>
                            <td>
                                <ul>
                                    <li>Added export to PDF.</li>
                                    <li>Added export to CSV.</li>
                                </ul>
                            </td>
                        </tr>
                        <tr>
                            <td>1.2.1</td>
                            <td> </td>
                            <td>
                                <ul>
                                    <li>Added page numbers to PDF.</li>
                                    <li>Reformatted PDF.</li>
                                    <li>Ensured functional links in PDF.</li>
                                </ul>
                            </td>
                        </tr>
                        <tr>
                            <td>1.2.2</td>
                            <td> </td>
                            <td>
                                <ul>
                                    <li>Expand UK definition.</li>
                                </ul>
                            </td>
                        </tr>
                        <tr>
                            <td>1.2.3</td>
                            <td> </td>
                            <td>
                                <ul>
                                    <li>Ceased UBOs/PSCs provides the date their engagement was ceased where available.</li>
                                </ul>
                            </td>
                        </tr>
                        <tr>
                            <td>1.2.4</td>
                            <td> </td>
                            <td>
                                <ul>
                                    <li>Ceased UBOs/PSCs provides the date their engagement was ceased for individuals and non-UK entities where available.</li>
                                </ul>
                            </td>
                        </tr>
                        <tr>
                            <td>1.2.5</td>
                            <td> </td>
                            <td>
                                <ul>
                                    <li>Code cleanup.</li>
                                </ul>
                            </td>
                        </tr>
                        <tr>
                            <td>1.2.6</td>
                            <td> </td>
                            <td>
                                <ul>
                                    <li>Updated styling and PDF generation.</li>
                                </ul>
                            </td>
                        </tr>
						<tr>
                            <td>1.2.7</td>
                            <td> </td>
                            <td>
                                <ul>
                                    <li>Added cookie info page.</li>
									<li>Added cookie preference reset link.</li>
                                </ul>
                            </td>
                        </tr>
                    </table>
                </div>
            `;
        }
    }

    // Function to show cookie information
    function showCookieInfo() {
        console.clear();
        const resultsDiv = document.getElementById("results");
        const companyNameDisplay = document.getElementById("companyNameDisplay");

        // Clear any existing search results or company name information
        if(resultsDiv) resultsDiv.innerHTML = "";
        if(companyNameDisplay) companyNameDisplay.innerHTML = "";

        // Create the HTML content for cookie information
        const cookieInfoHTML = `
            <div id="intro">
                <p>This page details the cookies used on our website:</p>
                <table>
                    <thead>
                        <tr>
                            <th>Cookie Name</th>
                            <th>Purpose</th>
                            <th>More information</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><code>cfz_google-analytics_v4</code></td>
                            <td>This cookie is essential for our site to enable Google Analytics 4 (GA4) tracking via Cloudflare Zaraz, a server-side tool that manages third-party scripts. It stores various engagement metrics and session data, including:<ul><li>Engagement Duration: The total time a user has interacted with the site.</li><li>Engagement Start Time: The timestamp when the user's engagement began.</li><li>Counter Values: General counters tracking user interactions.</li><li>Session Counter: The number of sessions initiated by the user.</li><li>GA4 Client ID: A unique identifier for the user in GA4.</li><li>Last Engagement Time: The timestamp of the last recorded user engagement.</li><li>GA4 Session ID: A unique identifier for the current session in GA4.</li></ul>These data points help us understand user behavior, optimize website performance, and enhance user experience by providing insights into how users interact with our site.<br>Duration: The cfz_google-analytics_v4 cookie typically persists for 30 minutes to 1 day.</td>
                            <td><a href="https://developers.cloudflare.com/zaraz/advanced/google-consent-mode/" target="_blank">Cloudflare Zaraz & GA4</a></td>
                        </tr>
                        <tr>
                            <td><code>cfzs_google-analytics_v4</code></td>
                            <td>This cookie is essential for our site to enable Google Analytics 4 (GA4) tracking via Cloudflare Zaraz, a server-side tool that manages third-party scripts. It stores various engagement metrics and session data, including:<ul><li>Engagement Duration: The total time a user has interacted with the site.</li><li>Engagement Start Time: The timestamp when the user's engagement began.</li><li>Counter Values: General counters tracking user interactions.</li><li>Session Counter: The number of sessions initiated by the user.</li><li>GA4 Client ID: A unique identifier for the user in GA4.</li><li>Last Engagement Time: The timestamp of the last recorded user engagement.</li><li>GA4 Session ID: A unique identifier for the current session in GA4.</li></ul>These data points help us understand user behavior, optimize website performance, and enhance user experience by providing insights into how users interact with our site.<br>Duration: The cfzs_google-analytics_v4 cookie typically persists for 30 minutes to 1 day.</td>
                            <td><a href="https://developers.cloudflare.com/zaraz/advanced/google-consent-mode/" target="_blank">Cloudflare Zaraz & GA4</a></td>
                        </tr>
                        <tr>
                            <td><code>_ga</code></td>
                            <td>The _ga cookie is set by Google Analytics and is used to distinguish unique users by assigning a randomly generated number as a client identifier. This cookie helps us analyze how visitors interact with our website and allows us to improve user experience by:<ul><li>Tracking User Behavior: Identifying and differentiating users for analytics purposes, helping us understand how visitors navigate our site, what pages they visit, and how long they stay.</li><li>Session Tracking: Tracking sessions to monitor user interactions within a specific time frame, including pageviews, clicks, and other engagement metrics.</li><li>Optimizing Performance: The data collected from this cookie helps us optimize website functionality, user experience, and performance.</li></ul>The _ga cookie does not store any personally identifiable information, and it is primarily used for statistical purposes to help us improve our website.<br>Duration: The _ga cookie has a duration of 2 years from the date it is set or updated.</td>
                            <td><a href="https://developers.google.com/analytics/devguides/collection/analyticsjs/cookie-usage" target="_blank">Google Analytics Cookie Usage</a></td>
                        </tr>
                        <tr>
                            <td><code>cf_clearance</code></td>
                            <td>This cookie is essential for our site to verify that a user has passed a Cloudflare security check, such as a CAPTCHA or browser integrity check. It ensures uninterrupted access to the website for users who have already proven they are not malicious bots.<ul><li>This cookie:<ul><li>(f) Allows Cloudflare to distinguish between trusted human users and potentially malicious traffic.</li><li>Helps maintain performance and security of the website by preventing repeated challenges once clearance has been granted.</li><li>Is set by Cloudflare and is necessary for the proper functioning of protection mechanisms like rate limiting and bot mitigation.</li></ul></li></ul>Duration: The cf_clearance cookie typically persists for 30 minutes to 1 day, but it may last longer.</td>
                            <td><a href="https://developers.cloudflare.com/fundamentals/reference/policies-compliance/cookie-table/#cf_clearance" target="_blank">Cloudflare Clearance Cookie</a></td>
                        </tr>
						<tr>
                            <td><code>cookies_accepted</code></td>
                            <td> This cookie stores the user's consent decision regarding the use of cookies on the website, allowing the site to remember the user's preference and avoid repeatedly showing the cookie consent banner.<ul><li>This cookie:<ul><li>(f) Remembers whether the user has accepted or declined non-essential cookies.</li><li>Prevents the cookie banner from reappearing unnecessarily on subsequent visits.</li><li>Improves user experience by respecting their cookie preferences.</li></ul></li></ul>Duration: This cookie persists for 1 year from the time of consent.</td>
                            <td>No third-party access</td>
                        </tr>
                    </tbody>
                </table>
				<br>
                <p>To opt out of being tracked by Google Analytics across all websites, visit <a href="http://tools.google.com/dlpage/gaoptout" target="_blank">http://tools.google.com/dlpage/gaoptout</a>.</p>
				<p><a id="resetCookiePrefs" href="#">Click here</a> to reset your cookie preferences and refresh the page.</p>
            </div>
        `;

        // Set the HTML to the results div
        if (resultsDiv) {
            resultsDiv.innerHTML = cookieInfoHTML;
        } else {
            console.error("Results div not found when trying to show cookie info.");
        }
		
		// Attach event listener for the dynamically added reset link
        const resetLink = document.getElementById('resetCookiePrefs');
        if (resetLink) {
            console.log("resetCookiePrefs link found. Attaching listener.");
            resetLink.addEventListener('click', function(event) {
                event.preventDefault();
                resetCookiePreferences();
            });
        } else {
            console.error("resetCookiePrefs link NOT found after dynamic creation.");
        }
    }


    function resetCookiePreferences() {
        console.log("Resetting cookie preferences...");
        document.cookie = "cookies_accepted=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        console.log("cookies_accepted cookie should be deleted.");
        location.reload();
    }
	
	document.addEventListener("DOMContentLoaded", function() {
        console.log("DOMContentLoaded event fired and listener entered.");
        // acceptCookies and declineCookies are defined within this IIFE's scope
        
        function allConsentGranted() {
            gtag('consent', 'update', {
                'ad_storage': 'granted',
                'ad_user_data': 'granted',
                'ad_personalization': 'granted',
                'analytics_storage': 'granted'
            });
            // Optionally set a cookie to remember the user's choice
            document.cookie = "cookies_accepted=true; path=/; max-age=" + 60*60*24*365; // 1 year
            console.log("All consent granted and cookie_accepted=true set.");
        }

        function allConsentDeclined() {
            gtag('consent', 'update', {
                'ad_storage': 'denied',
                'ad_user_data': 'denied',
                'ad_personalization': 'denied',
                'analytics_storage': 'denied'
            });
            // Optionally set a cookie to remember the user's choice
            document.cookie = "cookies_accepted=false; path=/; max-age=" + 60*60*24*365; // 1 year
            console.log("All consent declined and cookie_accepted=false set.");
        }

        const acceptButton = document.getElementById("acceptCookies");
        const declineButton = document.getElementById("declineCookies");
        
        // Link for showing cookie info
        const showCookieInfoLink = document.getElementById("showCookieInfo"); 

        if (acceptButton) {
            acceptButton.addEventListener("click", function(event) {
                event.preventDefault();
                allConsentGranted();
                acceptCookies(); 
            });
        } else {
            console.error("Accept cookies button not found.");
        }

        if (declineButton) {
            declineButton.addEventListener("click", function(event) {
                event.preventDefault();
                allConsentDeclined();
                declineCookies(); 
            });
        } else {
            console.error("Decline cookies button not found.");
        }

        // Attach event listener for the "Cookie Info" link in the footer
        if (showCookieInfoLink) {
            console.log("showCookieInfo link found. Attaching listener.");
            showCookieInfoLink.addEventListener('click', function(event) {
                event.preventDefault();
                showCookieInfo();       // Call the function to display cookie info
            });
        } else {
            console.error("showCookieInfo link NOT found.");
        }
        
        // Check if cookies are already accepted/declined from a previous session
        // And hide banner if already actioned
        if(document.cookie.includes('cookies_accepted=true')) {
            allConsentGranted(); // Ensure gtag consent is updated
            acceptCookies();     // Hide banner
        } else if(document.cookie.includes('cookies_accepted=false')) {
            allConsentDeclined(); // Ensure gtag consent is updated
            declineCookies();     // Hide banner
        } else {
            // If no cookie is set, the banner should be visible by default
            var cookieBanner = document.getElementById("cookie-banner");
            if (cookieBanner) {
                cookieBanner.style.display = "block"; // Or "flex", or its default display style
            }
        }

        // Attach event listeners for Search, Reset, and Patch Notes
        const searchButton = document.getElementById("searchButton");
        const resetButton = document.getElementById("resetButton");
        const patchNotesLink = document.getElementById('patchNotes');

        if (searchButton) {
            searchButton.addEventListener('click', searchCompany);
        }
        if (resetButton) {
            resetButton.addEventListener('click', resetForm);
        }
        if (patchNotesLink) {
            patchNotesLink.addEventListener('click', function(event) {
                event.preventDefault();
                patchNotes();
            });
        }
    });

    // Expose functions to global scope (exportToPDF and exportToCSV are called by dynamically created buttons)
    window.searchCompany = searchCompany;
    window.resetForm = resetForm;
    window.patchNotes = patchNotes;
    window.exportToPDF = exportToPDF;
    window.exportToCSV = exportToCSV;

})();
