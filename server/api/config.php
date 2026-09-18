<?php
declare(strict_types=1);
if (!defined('YEOP_API')) { http_response_code(404); exit; }
// Values below are public configuration, not account credentials.
return ['release'=>'RELEASE_ID', 'api_base'=>'RELEASE_BASEapi/', 'naver_enabled'=>true];
