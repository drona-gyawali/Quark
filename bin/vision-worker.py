# I called this overengineering. just for fun I know it doesnot make any sense 
# to switch to another lang just forone task . The problem was unstructered is thousand times
# better than other tool for pdf , and ocr stuff so i cannot leave  unstr.. but unstr. ask 
# money for image extraction.. so shifting to this hacky way.. And ts/js donot have native 
# support for the lib pdfPlumber....

import pdfplumber
import base64
import io
import json
import sys

def extract_images(pdf_path):
    images_by_page = {}
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for i, page in enumerate(pdf.pages):
                page_num = i + 1
                images_by_page[page_num] = []
                
                for j, image in enumerate(page.images):
                    bbox = (image['x0'], image['top'], image['x1'], image['bottom'])
                    img_obj = page.within_bbox(bbox).to_image(resolution=150)
                    
                    buffered = io.BytesIO()
                    img_obj.original.save(buffered, format="PNG")
                    img_str = base64.b64encode(buffered.getvalue()).decode()
                    images_by_page[page_num].append(img_str)
                    
        return json.dumps(images_by_page)
    except Exception as e:
        return json.dumps({"error": str(e)})

if __name__ == "__main__":
    # extracting pdf from command line
    pdf_path = sys.argv[1]
    print(extract_images(pdf_path))