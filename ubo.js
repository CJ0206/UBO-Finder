const BASE_URL = "https://[BASE_URL]/companies-house-api";  // NGINX proxy API

// Fetch basic company data (including name) for a company
async function getCompanyInfo(companyNumber) {
    // Capitalize the company number
    companyNumber = companyNumber.toUpperCase();

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
    // Capitalize the company number
    companyNumber = companyNumber.toUpperCase();

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
    if (!naturesOfControl) return "Not Specified";
    
    for (let control of naturesOfControl) {
        if ((control.includes("ownership-of-shares-") || control.includes("voting-rights-")) && control.includes("-percent")) {
            let ownership = control.replace("ownership-of-shares-", "")
                                  .replace("voting-rights-", "")
								  .replace("-percent", "")
								  .replace("-as-trust", "")
								  .replace("-as-firm", "")
								  .replace("-limited-liability-partnership", "")
								  .replace("-registered-overseas-entity", "")
                                  .replace(/-/g, " ")
                                  .trim();
            return `${ownership}%`;
        }
    }
    return "Not Specified";
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

    // Remove any blank spaces in the input
    companyNumberInput = companyNumberInput.replace(/\s/g, "");

    // Capitalize the company number
    companyNumberInput = companyNumberInput.toUpperCase();

    // Ensure the company number is always 8 characters long (pad with leading zeros if numeric)
    let companyNumber = companyNumberInput.length >= 6 && companyNumberInput.length < 8 && !isNaN(companyNumberInput) ? companyNumberInput.padStart(8, '0') : companyNumberInput;

    let resultsDiv = document.getElementById("results");
    let companyNameDisplay = document.getElementById("companyNameDisplay");

    // Clear previous results and introduction
    resultsDiv.innerHTML = "";
    companyNameDisplay.innerHTML = "";

    // Validate the company number input
    if (!companyNumber) {
        resultsDiv.innerHTML = "<p>The company could not be found.</p><p>Please note this form only works with company numbers.</p>";
        return;
    }

    resultsDiv.innerHTML = "<p>Loading...</p>"; // Show loading message

    const companyInfo = await getCompanyInfo(companyNumber); // Fetch company information

    // Handle case where company information is not found
    if (!companyInfo) {
        resultsDiv.innerHTML = "<p>Error: Company not found.</p><p>Please check the company number.</p>";
        return;
    }

    // Log all the data returned about the company
    console.log('Company Info:', companyInfo);

    const companyName = companyInfo.company_name || "Unknown Company";
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
    const formattedCompanyNumber = formatCompanyNumber(companyNumber); // Format company number to 8 digits and capitalize it
    console.log("Fetching PSC data for company:", formattedCompanyNumber);

    // Fetch company information
    let companyInfo;
    try {
        companyInfo = await getCompanyInfo(formattedCompanyNumber);
    } catch (error) {
        if (error.status === 404) {
            resultsDiv.innerHTML = "<p>Error: Company not found (404).</p><p>Please check the company number, if this error persists please log a ticket.</p>";
            return;
        } else if (error.status === 429) {
            resultsDiv.innerHTML = "<p>Error: Too many requests (429).</p><p>Please try again in 5 minutes when the API resets.</p>";
            return;
        } else {
            console.error("Error fetching company info:", error);
            resultsDiv.innerHTML = "<p>Error: Unable to fetch company information. Please try again later.</p>";
            return;
        }
    }

    const companyName = companyInfo ? companyInfo.company_name : "Unknown Company";
    const companyLink = `<a href="https://find-and-update.company-information.service.gov.uk/company/${formattedCompanyNumber}/persons-with-significant-control" target="_blank">${companyName}</a>`;

    const pscData = await getPSC(formattedCompanyNumber); // Fetch PSC data for the company

    // Create a new section to display company ownership data
    let companySection = document.createElement("div");
    companySection.innerHTML = `<br><h3>Ownership for Company: ${companyLink}</h3>`;
    resultsDiv.appendChild(companySection);

    if (!pscData || !pscData.items || pscData.items.length === 0) {
        let jurisdiction = companyInfo?.jurisdiction || "an unknown jurisdiction";
        jurisdiction = capitalizeWords(jurisdiction); // Capitalize each word in the jurisdiction
        companySection.innerHTML += `<br><h3>${companyName} is registered in ${jurisdiction}. No further PSC data is available.</h3>`;
        return ownershipChain;
    }

    let tableHTML = "<table border='1'><tr><th>Company Owner</th><th>Company Number</th><th>Ownership Percentage</th><th>Status</th><th>See on Companies House</th></tr>";
    let foreignEntityMessage = "";

    for (const psc of pscData.items) {
        console.log('Full PSC Data:', psc);

        let ownershipPercentage = getOwnershipPercentage(psc.natures_of_control);
        let legalAuthority = psc.identification?.country_registered ? psc.identification.country_registered.toLowerCase() : '';
        let registrationNumber = psc.identification?.registration_number ? (psc.identification.registration_number.length >= 6 ? psc.identification.registration_number.toString().padStart(8, '0') : psc.identification.registration_number) : '';
        let companyNumberDisplay = registrationNumber ? registrationNumber.toUpperCase() : 'N/A';

        let viewLink = `<a href="https://find-and-update.company-information.service.gov.uk/company/${registrationNumber}/persons-with-significant-control" target="_blank">View on CH</a>`;
        let status = psc.ceased ? "Ceased" : "Active";

        if (psc.ceased) {
            viewLink = "N/A - Ceased PSC.";
        } else if (legalAuthority && !["england", "wales", "scotland", "united kingdom (scotland)", "united kingdom", "uinted kingdom", "united kingdom (england)", "united kingdom (wales)", "england & wales", "england and wales", "uk", "england-wales"].includes(legalAuthority)) {
            companyNumberDisplay = `${legalAuthority.toUpperCase()}: ${registrationNumber.toUpperCase()}`;
            console.log(`Non-UK entity detected: ${companyNumberDisplay}. Stopping recursion.`);
            legalAuthority = capitalizeWords(legalAuthority); // Capitalize each word in the legal authority
            foreignEntityMessage = `<br><h3>${psc.name} is registered in ${legalAuthority}. No further data is available.</h3>`;
            viewLink = "N/A";
        } else if (companyNumberDisplay.length !== 8) {
            viewLink = "N/A - Invalid CH Number.";
        }

        if (psc.kind === "individual-person-with-significant-control") {
            viewLink = "N/A - Individual.";
        }

        if (psc.kind === "corporate-entity-person-with-significant-control" && !registrationNumber) {
            viewLink = "N/A - No CH Number.";
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
        if (!psc.ceased && registrationNumber.length === 8 && psc.kind === "corporate-entity-person-with-significant-control" && ["england", "wales", "scotland", "united kingdom (scotland)", "united kingdom", "uinted kingdom", "united kingdom (england)", "united kingdom (wales)", "england & wales", "england and wales", "uk", "england-wales"].includes(legalAuthority)) {
            if (registrationNumber) {
                console.log("Recursively tracing ownership for company:", registrationNumber);
                await findUltimateOwner(registrationNumber, ownershipChain, resultsDiv);
            } else {
                console.log('No valid company number found for recursion');
            }
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

    // Retrieve the first company name and number
    const firstCompanyHeader = document.querySelector("h3");
    const firstCompanyText = firstCompanyHeader ? firstCompanyHeader.textContent.replace("Ownership for Company: ", "") : "";
    const firstCompanyName = firstCompanyText.split(" - ")[0];
    const firstCompanyNumber = document.getElementById("companyNumber").value.toUpperCase();

    // Get the current date in YYYYMMDD format
    const currentDate = new Date().toISOString().split('T')[0].replace(/-/g, '');

    const margin = 10;
    const pageWidth = doc.internal.pageSize.width;
    const maxWidth = pageWidth - 5 * margin;

    // Set the title with the first company name and number, and wrap the text
    const titleText = `Company Ownership Data: ${firstCompanyName} (${firstCompanyNumber})`;
    const wrappedTitle = doc.splitTextToSize(titleText, maxWidth);
    doc.setFontSize(18);
    wrappedTitle.forEach((line, index) => {
        doc.text(line, margin, 20 + (index * 10));
    });

    let startY = 20 + (wrappedTitle.length * 10); // Adjust startY based on title height

    const tableData = [];
    document.querySelectorAll("h3, table tr").forEach((row, rowIndex) => {
        if (row.tagName === "H3") {
            // Add company ownership header
            if (rowIndex !== 0) { // Add a space between different company sections
                tableData.push([{ content: "", colSpan: 5, styles: { fillColor: [255, 255, 255] } }]);
            }
            const companyName = row.textContent;
            tableData.push([{ content: companyName, colSpan: 5, styles: { fillColor: [220, 220, 220], fontStyle: 'bold', halign: 'center', valign: 'middle' } }]);
        } else {
            // Add table rows
            let rowData = Array.from(row.querySelectorAll("td, th")).map((cell, colIndex) => {
                if (colIndex === 4) {
                    const linkElement = cell.querySelector("a");
                    const linkText = cell.textContent.trim();
                    const link = linkElement ? linkElement.getAttribute("href") : '';
                    return link ? { content: linkText, link: link } : { content: linkText };
                } else {
                    return { content: cell.textContent.trim() };
                }
            });
            tableData.push(rowData);
        }
    });

    // Add the table using autoTable plugin
    doc.autoTable({
        startY: startY,
        head: [['Company Owner', 'Company Number', 'Ownership Percentage', 'Status', 'See on Companies House']],
        body: tableData,
        theme: 'grid',
        headStyles: {
            fillColor: [0, 188, 212],
            halign: 'center'
        },
        styles: {
            fontSize: 10,
            cellPadding: 3,
            overflow: 'linebreak', // Ensure text wraps within cells
            halign: 'center', // Horizontal alignment for cells
            valign: 'middle' // Vertical alignment for cells
        },
        didParseCell: function (data) {
            if (data.cell.raw.link) {
                data.cell.text = ''; // Clear the default text to avoid duplication
            }
        },
        didDrawCell: function (data) {
            if (data.column.index === 4 && data.cell.section === 'body' && data.cell.raw.link) {
                doc.setTextColor(0, 0, 255);
                doc.textWithLink(data.cell.raw.content, data.cell.x + data.cell.padding('horizontal'), data.cell.y + data.cell.height / 2 + 3, {
                    url: data.cell.raw.link
                });
                doc.setTextColor(0, 0, 0);
            }
        },
        didDrawPage: function (data) {
            const totalPages = doc.internal.getNumberOfPages();
            const pageNumber = data.pageNumber;

            // Add custom footer with current date and time in 24-hour format
            const footerText = "Searched using CJs Pi - UBO Finder";
            const date = new Date();
            const formattedDate = date.toLocaleString("en-GB", { hour12: false });

            doc.setFontSize(10);
            doc.text(footerText, margin, doc.internal.pageSize.height - 10); // Left-aligned footer text
            doc.text(formattedDate, doc.internal.pageSize.width - 60, doc.internal.pageSize.height - 10); // Right-aligned date and time
            doc.text(`${pageNumber} / ${totalPages}`, doc.internal.pageSize.width / 2, doc.internal.pageSize.height - 10, { align: 'center' }); // Centered page number
        }
    });

    // Save the PDF file with the desired filename format
    const filename = `Company Ownership Data - ${firstCompanyName} ${firstCompanyNumber} - ${currentDate}.pdf`;
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
			<br>
			<hr>
			<br>
			<p>Please note that if a missing company number is returned, the search will terminate and display the results obtained up to that point. You may need to check Companies House and rerun the search for the last entity found once you have obtained its complete UK company number.</p>
        </div>
    `;
}

// Function to hide cookie banner once accepted
function acceptCookies() {
	var cookieBanner = document.getElementById("cookie-banner");
	if (cookieBanner) {
		cookieBanner.style.display = "none";
	} else {
		console.log("Cookie banner not found.");
	}
}

function declineCookies() {
	var cookieBanner = document.getElementById("cookie-banner");
	if (cookieBanner) {
		cookieBanner.style.display = "none";
	} else {
		console.log("Cookie banner not found.");
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
                </table>
            </div>
        `;
    }
}


window.searchCompany = searchCompany;
window.resetForm = resetForm;
