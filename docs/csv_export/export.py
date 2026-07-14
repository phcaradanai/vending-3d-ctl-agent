import pandas as pd
import json

xl = pd.ExcelFile(r'D:\Projects\vending-3d-ctl-agent\docs\ADM-VENDIND-3DOOR.xlsx')
for i, sheet in enumerate(xl.sheet_names):
    df = pd.read_excel(xl, sheet_name=sheet)
    # clean sheet name for filename
    clean_name = sheet.replace(" ", "_").replace("(", "").replace(")", "")
    out_path = rf'D:\Projects\vending-3d-ctl-agent\docs\csv_export\sheet_{i}_{clean_name}.csv'
    df.to_csv(out_path, index=False, encoding='utf-8-sig')
    print(f'Exported {sheet} to {out_path}')
